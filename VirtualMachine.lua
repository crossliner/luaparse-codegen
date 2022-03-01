-- Virtual Machine for the
-- philadelphia instruction set

local open = io.open
local json = require("./json");

local function read_file(path)
  local file = open(path, "rb") -- r read mode and b binary mode
  if not file then return nil end
  local content = file:read "*a" -- *a or *all reads the whole file
  file:close()
  return content
end

local opreationCodes = {
  LOAD = 1,
  GETVAR = 2,
  SETVAR = 3,
  CALL = 4,
  JUMPIFNOT = 5,
  JUMPIF = 6,
  JUMP = 7,
  ADD = 8, 
  SUB = 9, 
  DIV = 10, 
  MUL = 11, 
  POW = 12, 
  MOD = 13,
  EQ = 14,
  SETNIL = 15
};

local virtualMachineCode = json.decode(read_file("./program.json"));

local constants = virtualMachineCode.constants;
local ir = virtualMachineCode.instructions;
local registers = {};
local pc = 0;

local function getRegister(register) 
  return registers[register + 1]
end;

local function setRegister(register, value) 
  registers[register + 1] = value;
end;

local function getConstant(constantIdx) 
  return constants[constantIdx + 1];
end;

local function isOpCode(instruction, op) 
  return opreationCodes[op] == instruction.code;
end;

local function isBinaryOp(instruction) 
  local binaryOps = { "ADD", "SUB", "DIV", "MUL", "POW", "MOD", "EQ" };
  for i, v in next, binaryOps do 
    if (isOpCode(instruction, v)) then return true, v end;
  end;
  
  return false;
end;

local function executeBinaryOp(op, a, b, c) 
  local A = getRegister(a);
  local B = getRegister(b);
  local C;
  
  if (op == "ADD") then 
    C = A + B;
  elseif (op == "SUB") then
    C = A - B;
  elseif (op == "DIV") then
    C = A / B;
  elseif (op == "MUL") then
    C = A * B;
  elseif (op == "POW") then
    C = A ^ B;
  elseif (op == "MOD") then
    C = A % B;
  elseif (op == "EQ") then
    C = A == B;
  end;
  
  setRegister(c, C);
end;

local env = { print = print, fart = function() return "nigger", "joe" end };


local function execute() 
  while true do 
    local instruction = ir[pc + 1];
    if not instruction then break end;

    local data = instruction.data;

    if (isOpCode(instruction, "LOAD")) then
      setRegister(data[2], getConstant(data[1]));
    elseif (isOpCode(instruction, "GETVAR")) then
      setRegister(data[2], env[getConstant(data[1])]);
    elseif (isOpCode(instruction, "SETVAR")) then
      env[getConstant(data[2])] = getRegister(data[1]);
    elseif (isOpCode(instruction, "JUMP")) then
      pc = data[1];
    elseif (isOpCode(instruction, "JUMPIFNOT")) then
      local value = getRegister(data[1]);
      if (not value) then pc = data[2] end;
    elseif (isOpCode(instruction, "JUMPIF")) then
      local value = getRegister(data[1]);
      if (value) then pc = data[2] end;
    elseif (isOpCode(instruction, "CALL")) then
      local args = data[2];
      local callArgs = {};
      local callee = getRegister(data[1]);

      for i, v in next, args do 
        local e = getRegister(v);
        callArgs[i] = e;
      end;
      
      setRegister(data[3], callee(table.unpack(callArgs)));
    elseif (isOpCode(instruction, "SETNIL")) then
      setRegister(data[1], nil);
    end;
    
    local isBinaryOp, binaryOp = isBinaryOp(instruction);
    if (isBinaryOp) then executeBinaryOp(binaryOp, data[1], data[2], data[3]) end;
    
    pc = pc + 1;
  end;
end;

execute();