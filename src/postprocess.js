function createAssignmentStatement(init, variable) {
  return {
    type: "AssignmentStatement",
    init,
    variable
  }
}

function createTableAssignmentStatement(init, variable) {
  return {
    type: "TableAssignmentStatement",
    init,
    variable
  }
}


function createNilLiteral() {
  return {
    type: "NilLiteral",
    value: null,
    raw: "nil"
  }
}

function processAssignmentStatement(value) {
  const newStatements = [];
  value.variables.forEach((variable, idx) => {
    
    const assignmentValue = value.init[idx] ? value.init[idx] : createNilLiteral();
    if (variable.type === "IndexExpression") {
      return newStatements.push(createTableAssignmentStatement(variable, assignmentValue));
    }
    newStatements.push(createAssignmentStatement(variable, assignmentValue));
  });
  
  return newStatements;
};

module.exports = function(ast) {
  function traverse(astTree) {
    for (let i in astTree) {
      const value = astTree[i];
      // if (value.type === "AssignmentStatement") {
      //   // const newStatements = processAssignmentStatement(value);
      //   // astTree.splice(i, 1);
      //   // astTree.push(...newStatements);
      // }
      
      if (typeof value === "object") {
        traverse(value);
      }
    }
  };
  
  const tree = structuredClone(ast);
  traverse(tree);
  
  return tree;
}