const postprocessAst = require("./postprocess");
const { readFileSync } = require("fs");
const source = readFileSync("script.lua", { encoding: "utf-8" });

const parser = require('./luaparse');
const ast = parser.parse(source, {
  encodingMode: "x-user-defined",
  scope: true
});

class Scope {
  constructor(top) {
    if (top) this.top = top;
    
    this.map = new Map();
  };
  
  get(key) {
    const value = this.map.get(key);
    if (!value && this.top) return this.top.get(key);
    
    return value;
  }
  
  set(key, value) {
    const scopeValue = this.get(key);
    if (scopeValue) return this.top.set(key, value);
    
    this.map.set(key, value);
  }
}

const opreationCodes = {
  "LOAD": 1,
  "GETVAR": 2,
  "SETVAR": 3,
  "CALL": 4,
  "JUMPIFNOT": 5,
  "JUMPIF": 6,
  "JUMP": 7,
  "ADD": 8, 
  "SUB": 9, 
  "DIV": 10, 
  "MUL": 11, 
  "POW": 12, 
  "MOD": 13,
  "EQ": 14,
  "SETNIL": 15,
  "NEWTABLE": 16,
  "SETTABLEK": 17,
  "SETTABLE": 18,
  "PUSHTABLE": 19,
  "GETTABLEK": 20,
  "NEWSCOPE": 21,
  "SCOPEGET": 22,
  "SCOPESET": 23,
  "GETTABLE": 24
};

const ir = [];
const constants = [];
let registers = 0;
let constantsUsed = {};

const mainScope = new Scope();
let mainScopeRegister = allocateRegister();
emit("NEWSCOPE", [ mainScopeRegister ]);

function allocateRegister() {
  registers++;
  
  return registers;
};

function emit(opcode, data) { // data is a array
  ir.push({ code: opreationCodes[opcode], data });
};


function getConstant(value) {
  const constantIdx = constants.findIndex((constantVal) => constantVal == value);
  if (constantIdx == -1) {
    const idx = constants.push(value) - 1;
    return idx;
  };
  
  return constantIdx;
}

function createScope(scope) {
  const scopeRegister = allocateRegister();
  emit("NEWSCOPE", [ scopeRegister, scope.register ]);
  
  return {
    scope: new Scope(scope.scope),
    register: scopeRegister
  }
}

function getTableFromMemberExpression(node, parent) {
  const { base, identifier } = node;
  let baseVal = undefined;
  let tableRegister = allocateRegister();
  let sharedRegister = undefined;
  
  if (base.type === "MemberExpression") {
    baseVal = getTableFromMemberExpression(base, parent);
  } else { 
    baseVal = compileNode(base, { type: "" });
  };
  
  const iden = compileNode(identifier, parent);
  
  if (baseVal.type === "variable") sharedRegister = baseVal.register
  if (baseVal.sharedRegister) sharedRegister = baseVal.sharedRegister;
  
  if (base.type === "MemberExpression") { 
    emit("GETTABLE", [ sharedRegister, baseVal.constant, tableRegister ]) 
    sharedRegister = tableRegister;
  } else {
    tableRegister = baseVal.register;
  };
  
  return { register: tableRegister, constant: iden.constant, sharedRegister };
};

function compileNode(node, parent, ignore) {
  if (!ignore && !parent) throw new Error("parent is missing");
  if (!node.hasOwnProperty("scope")) node.scope = { 
    scope: mainScope,
    register: mainScopeRegister
  };
  
  if (parent && parent.scope && parent.scope.scope !== mainScope) node.scope = parent.scope;
   
  if (node.type === "Identifier") {
    return compileIdentifier(node, parent);
  } else if (node.type === "NumericLiteral" || node.type === "StringLiteral" || node.type === "BooleanLiteral" || node.type === "NilLiteral") {
    return compileLiteral(node, parent);
  } else if (node.type === "CallStatement") {
    return compileCallStatement(node, parent);
  } else if (node.type === "CallExpression" || node.type === "StringCallExpression") {
    return compileCallExpression(node, parent);
  } else if (node.type === "WhileStatement") {
    node.scope = createScope(node.scope);
    return compileWhileStatement(node, parent);
  } else if (node.type === "BreakStatement") {
    return compileBreakStatement(node, parent);
  } else if (node.type === "BinaryExpression") {
    return compileBinaryExpression(node, parent);
  } else if (node.type === "IfStatement") {
    node.scope = createScope(node.scope);
    compileIfStatement(node, parent);
  } else if (node.type === "TableConstructorExpression") {
    return compileTableExpression(node, parent);
  } else if (node.type === "AssignmentStatement") {
    return compileAssignmentStatement(node, parent);
  } else if (node.type === "LocalStatement") {
    return compileLocalStatement(node, parent);
  }
};

function compileNodes(nodes, parent) {
  nodes.forEach(node => compileNode(node, parent));
}

function compileTableExpression(node) {
  const tableRegister = allocateRegister();
  emit("NEWTABLE", [ tableRegister ]);
  
  node.fields.forEach(fieldNode => {
    if (fieldNode.type === "TableKeyString") {
      const key = compileNode(fieldNode.key, node);
      const value = compileNode(fieldNode.value, node);
      
      emit("SETTABLEK", [ tableRegister, key.constant, value.register ]);
    }
    
    if (fieldNode.type === "TableKey") {
      const key = compileNode(fieldNode.key, node);
      const value = compileNode(fieldNode.value, node);
      
      emit("SETTABLE", [ tableRegister, key.register, value.register ]);
    }
    
    if (fieldNode.type === "TableValue") {
      const value = compileNode(fieldNode.value, node);
      
      emit("PUSHTABLE", [ tableRegister, value.register ]);
    }
  });
  
  return { 
    type: "tableconstructor",
    register: tableRegister
  };
}

function compileIdentifier(node, parent) {
  const constant = getConstant(node.name);
  
  if (parent && parent.type === "AssignmentStatement" || parent.type === "TableConstructorExpression" || parent.type === "MemberExpression" || parent.type === "LocalStatement") {
    return { constant }
  };
  
  const register = allocateRegister();
  const parentScope = parent.scope;
  
  if (parentScope && parentScope.scope.get(node.name))
    emit("SCOPEGET", [ parentScope.register, constant, register ])
  else
    emit("GETVAR", [ constant, register ]);

  return { type: "variable", register, constant, name: node };
}

function compileBreakStatement(_, parent) {
  emit("JUMP", [ parent.breakLabel ]);
}

function emitBinaryOp(name, lhs, rhs, ret) {
  emit(name, [ lhs.register, rhs.register, ret ]);
}

function compileBinaryExpression(node) {
  const left = compileNode(node.left, node);
  const right = compileNode(node.right, node);
  const returnRegister = allocateRegister();

  if (node.operator === "+") {
    emitBinaryOp("ADD", left, right, returnRegister);
  } else if (node.operator === "-") {
    emitBinaryOp("SUB", left, right, returnRegister);
  } else if (node.operator === "/") {
    emitBinaryOp("DIV", left, right, returnRegister);
  } else if (node.operator === "*") {
    emitBinaryOp("MUL", left, right, returnRegister);
  } else if (node.operator === "^") {
    emitBinaryOp("POW", left, right, returnRegister);
  } else if (node.operator === "%") {
    emitBinaryOp("MOD", left, right, returnRegister);
  } else if (node.operator === "==") {
    emitBinaryOp("EQ", left, right, returnRegister)
  };
  
  
  return {
    type: "binaryexpr",
    register: returnRegister
  }
}

function compileIfStatement(node, parent) {
  const clauses = [];
  const endLabel = new compilerLabel();
  if (parent && parent.breakLabel) node.breakLabel = parent.breakLabel;
  
  for (let i in node.clauses) { // emit checking opreations
    const clause = node.clauses[i];
    
    if (clause.type === "IfClause") {
      const clauseLabel = new compilerLabel();
      clauses.push(clauseLabel);
      const condition = compileNode(clause.condition, node);
      
      emit("JUMPIF", [ condition.register, clauseLabel ]);
    }
    
    if (clause.type === "ElseClause") {
      const clauseLabel = new compilerLabel();
      clauses.push(clauseLabel);
      emit("JUMP", [ clauseLabel ]);
      hasElseLabel = true;
    }
  };
  
  emit("JUMP", [ endLabel ]);
  
  for (let i in node.clauses) {
    const clause = node.clauses[i];
    
    if (clause.type === "IfClause") {
      const clauseLabel = clauses[i];
      if (clauseLabel) clauseLabel.update();
      
      compileNodes(clause.body, node);
      emit("JUMP", [ endLabel ]);
    }
    
    if (clause.type === "ElseClause") {
      const clauseLabel = clauses[i];
      if (clauseLabel) clauseLabel.update();
      
      compileNodes(clause.body, node);
    }
  };
  
  endLabel.update();
}

function compileWhileStatement(node) {
  const condition = compileNode(node.condition, node);
  const whileLabel = new compilerLabel();
  node.breakLabel = new compilerLabel();
  
  compileNodes(node.body, node);
  emit("JUMPIF", [ condition.register, whileLabel ]);
  node.breakLabel.update();
} 

class compilerLabel {
  constructor(increment = 0) {
    this.label = ir.length - 1;
    this.increment = increment;
  }
  
  update(increment) {
    if (increment) this.increment = increment;
    this.label = ir.length - 1;
  }
  
  fetch() {
    return this.label + this.increment;
  }
  
  toString() {
    return this.fetch();
  }
  
  toJSON() {
    return this.fetch();
  }
};



function compileCallExpression(node) {
  const { register: functionRegister } = compileNode(node.base, node);
  const argumentRegisters = [];
  const retRegister = allocateRegister();
  
  if (node.type !== "StringCallExpression") 
    node.arguments.forEach(argument => {
      const { register } = compileNode(argument, node);
      argumentRegisters.push(register);
    });
  else
    argumentRegisters.push(compileNode(node.argument, node));
  
  emit("CALL", [ functionRegister, argumentRegisters, retRegister ]);
  return { type: "call", register: retRegister };
}

function compileCallStatement(node) {
  return compileNode(node.expression, node);
}

function compileLiteral(node) {
  const register = allocateRegister();
  
  if (node.type == "NilLiteral") {
    emit("SETNIL", [ register ]);
  } else {
    const constant = getConstant(node.value);
    emit("LOAD", [ constant, register ]);
  }
  
  return { type: "value", register };
};


function compileAssignmentStatement(node) {
  node.variables.forEach((nodeVar, idx) => {
    const initVar = node.init[idx] ? node.init[idx] : undefined;
    if (!initVar) return;
    
    if (nodeVar.type === "MemberExpression") {
      const init = compileNode(initVar, node);
      const tableVar = getTableFromMemberExpression(nodeVar, node);
      emit("SETTABLEK", [ tableVar.register, tableVar.constant, init.register ]);
      return;
    };
    
    const init = compileNode(initVar, node);
    if (initVar.type === "Identifier" && node.scope.scope.get(initVar.name)) 
      return emit("SCOPESET", [ node.scope.register, variable.constant, init.register ]);
    
    const variable = compileNode(nodeVar, node);
    
    
    emit("SETVAR", [ init.register, variable.constant ]);
  });
  
  //console.log(JSON.stringify(testScope, null, "\t"));
};

function compileLocalStatement(node) {
  node.variables.forEach((nodeVar, idx) => {
    const initVar = node.init[idx] ? node.init[idx] : undefined;
    if (!initVar) return;
    
    
    const init = compileNode(initVar, node);
    const variable = compileNode(nodeVar, node);
    node.scope.scope.set(nodeVar.name, init.register);
    
    emit("SCOPESET", [ node.scope.register, variable.constant, init.register ]);
  });
}

function printInstruction(instruction) {
  const [ A, B, C ] = instruction.data;
  const binaryOps = [ "ADD", "SUB", "DIV", "MUL", "POW", "MOD", "EQ" ];
  
  
  if (instruction.code === opreationCodes.LOAD) {
    console.log(`LOAD k${A} r${B}`);
  } else if (instruction.code === opreationCodes.GETVAR) {
    console.log(`GETVAR k${A} r${B}`);
  } else if (instruction.code === opreationCodes.SETVAR) {
    console.log(`SETVAR r${A} k${B}`);
  } else if (instruction.code === opreationCodes.JUMP) {
    console.log(`JUMP PC${A}`);
  } else if (instruction.code === opreationCodes.JUMPIFNOT) {
    console.log(`JUMPIFNOT r${A} PC${B}`);
  } else if (instruction.code === opreationCodes.JUMPIF) {
    console.log(`JUMPIF r${A} PC${B}`);
  } else if (instruction.code === opreationCodes.NEWTABLE) {
    console.log(`NEWTABLE r${A}`)
  } else if (instruction.code === opreationCodes.SETTABLEK) {
    console.log(`SETTABLEK r${A} k${B} r${C}`)
  } else if (instruction.code === opreationCodes.SETTABLE) {
    console.log(`SETTABLE r${A} r${B} r${C}`)
  } else if (instruction.code === opreationCodes.PUSHTABLE) {
    console.log(`PUSHTABLE r${A} r${B}`)
  } else if (instruction.code === opreationCodes.GETTABLEK) {
    console.log(`GETTABLEK k${A} r${B}`)
  } else if (instruction.code === opreationCodes.GETTABLE) {
    console.log(`GETTABLE r${A} k${B} r${C}`)
  } else if (instruction.code === opreationCodes.CALL) {
    console.log(`CALL r${A} r[r${B.join(" r")}] r${C}`);
  } else if (instruction.code === opreationCodes.NEWSCOPE) {
    console.log(`NEWSCOPE r${A} ${B ? "r" + B : ""}`)
  } else if (instruction.code === opreationCodes.SCOPESET) {
    console.log(`SCOPESET r${A} k${B} r${C}`)
  } else if (instruction.code === opreationCodes.SCOPEGET) {
    console.log(`SCOPEGET r${A} k${B} r${C}`)
  }
  
  binaryOps.forEach(op => { // to save manual work
    if (opreationCodes[op] === instruction.code) console.log(`${op} r${A} r${B} r${C}`);
  })
}

function printConstants(constants) {
  constants.forEach((constant, i) => {
    console.log(`k${i}: ${constant}`)
  });
}

function treverseTree(tree) {
  tree.body.forEach(node => {
    compileNode(node, null, true)
  });
};

const showOutput = true;

// const processedAst = postprocessAst(ast.body);
// console.log(JSON.stringify(ast, null, "\t"));

treverseTree(ast);

if (showOutput) {
  ir.forEach(instruction => printInstruction(instruction));
  console.log("");
  printConstants(constants);
} else {
  console.log(JSON.stringify({ constants, instructions: ir }))
}