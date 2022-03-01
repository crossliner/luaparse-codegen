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

let testScope = new Scope();
let firstScope = testScope;

function createScope() {
  const scope = new Scope(testScope);
  
  testScope = scope;
  
  return scope;
}

firstScope.set("test", "test 1");
let secondScope = createScope();

secondScope.set("test1", "test 2");

console.log(secondScope.get("test1"));