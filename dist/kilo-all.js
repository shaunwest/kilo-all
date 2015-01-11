/**
 * Created by Shaun on 5/1/14.
 *
 * TODO: create kilo-all
 */

(function(id) {
  'use strict';

  var core, Util, Injector, types, appConfig = {}, gids = {}, allElements, previousOwner = undefined;
  var CONSOLE_ID = id;

  Util = {
    isDefined: function(value) { return (typeof value !== 'undefined'); },
    isBoolean: function(value) { return (typeof value === 'boolean'); },
    def: function(value, defaultValue) { return (typeof value === 'undefined') ? defaultValue : value; },
    error: function(message) { throw new Error(CONSOLE_ID + ': ' + message); },
    warn: function(message) { Util.log('Warning: ' + message); },
    log: function(message) { if(core.log) { console.log(CONSOLE_ID + ': ' + message); } },
    argsToArray: function(args) { return Array.prototype.slice.call(args); },
    getGID: function(prefix) {
      prefix = Util.def(prefix, '');
      gids[prefix] = Util.def(gids[prefix], 0);
      return prefix + (++gids[prefix]);
    },
    rand: function(max, min) {
      min = min || 0;
      if(min > max || max < min) { Util.error('rand: invalid range.'); }
      return Math.floor((Math.random() * (max - min + 1))) + (min);
    }
  };

  types = ['Array', 'Object', 'Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'HTMLImageElement'];
  for(var i = 0; i < types.length; i++) {
    Util['is' + types[i]] = (function(type) { 
      return function(obj) {
        return Object.prototype.toString.call(obj) === '[object ' + type + ']';
      }; 
    })(types[i]);
  }

  Injector = {
    unresolved: {},
    modules: {},
    register: function(key, deps, func, scope) {
      this.unresolve(key);
      this.unresolved[key] = {deps: deps, func: func, scope: scope};
      return this;
    },
    unresolve: function(key) {
      if(this.modules[key]) {
        delete this.modules[key];
      }
      return this;
    },
    setModule: function(key, module) { // save a module without doing dependency resolution
      this.modules[key] = module;
      return this;
    },
    getDependency: function(key, cb) {
      var modules, module;

      modules = this.modules;
      module = modules[key];

      if(module) {
        cb(module);
        return;
      }

      if(key.indexOf('/') != -1) {
        httpGet(key, cb);
        return;
      }

      module = this.unresolved[key];
      if(!module) {
        getElement(key, null, function(element) {
          if(element) {
            cb(element);
          } else {
            Util.warn('Module \'' + key + '\' not found');
          }
        });
        return;
      }

      Util.log('Resolving dependencies for \'' + key + '\'');
      this.resolveAndApply(module.deps, module.func, module.scope, function(module) {
        if(Util.isObject(module)) {
          module.getType = function() { return key; };
        }
        modules[key] = module;
        cb(module);
      });

      return;
    },
    resolve: function(deps, cb, index, results) {
      var dep, depName;
      var that = this; // FIXME

      if(!deps) {
        done();
        return;
      }

      index = Util.def(index, 0);

      depName = deps[index];
      if(!depName) {
        cb(results);
        return;
      }
      
      this.getDependency(depName, function(dep) {
        if(!results) {
          results = [];
        }
        if(dep) {
          results.push(dep);
        } else {
          Util.error('Can\'t resolve ' + depName);
        }

        that.resolve(deps, cb, index + 1, results);    
      });
    },
    apply: function(args, func, scope) {
      var result = func.apply(scope || core, args);
      return result;
    },
    resolveAndApply: function(deps, func, scope, cb) {
      var that = this;
      this.resolve(deps, function(args) {
        var result = that.apply(args, func, scope);
        if(cb && Util.isFunction(cb)) {
          cb(result);
        }
      });
    },
    process: function(deps, cb) {
      var i, numDeps, obj;
      if(Util.isArray(deps)) {
        for(i = 0, numDeps = deps.length; i < numDeps; i++) {
          obj = deps[i]; 
          if(Util.isString(obj)) {
            this.getDependency(obj, function(obj) {
              cb(obj);
            });
          } else {
            cb(obj);
          }
        }
      } else {
        if(Util.isString(deps)) {
          this.getDependency(deps, function(deps) {
            cb(deps);
          });
        } else {
          cb(deps);
        }
      }
    }
  };

  /** run onReady when document readyState is 'complete' */
  function onDocumentReady(onReady) {
    var readyStateCheckInterval;
    if(!onReady) return;
    if(document.readyState === 'complete') {
      onReady(document);
    } else {
      readyStateCheckInterval = setInterval(function () {
        if(document.readyState === 'complete') {
          onReady(document);
          clearInterval(readyStateCheckInterval);
        }
      }, 10);
    }
  }

  function registerDefinitionObject(result) {
    var key;
    if(Util.isObject(result)) {
      for(key in result) {
        if(result.hasOwnProperty(key)) {
          Injector.register(key, [], (
            function(func) {
              return function() { return func; };
            }
          )(result[key]));
        }
      }
    }
  }

  // TODO: performance
  function getElement(elementId, container, cb) {
    onDocumentReady(function(document) {
      var i, numElements, element, elements, bracketIndex, results = [];
      if(!container) {
        if(!allElements) {
          container = document.getElementsByTagName('body');
          if(!container || !container[0]) {
            return;
          }
          allElements = container[0].querySelectorAll('*');
        }
        elements = allElements;
      } else {
        elements = container.querySelectorAll('*');
      }

      bracketIndex = elementId.indexOf('[]');
      if(bracketIndex !== -1) {
        elementId = elementId.substring(0, bracketIndex);
      }
      for(i = 0, numElements = elements.length; i < numElements; i++) {
        element = elements[i];
        if(element.hasAttribute('data-' + elementId)) {
          results.push(element);
        }
      }
      if(bracketIndex === -1) {
        cb(results[0]);
      } else {
        cb(results);
      }
    }); 
  }

  function parseResponse(contentType, responseText) {
    switch(contentType) {
      case 'application/json':
      case 'application/json; charset=utf-8':
        return JSON.parse(responseText);
      default:
        return responseText;
    }
  }

  function httpGet(url, onComplete, onProgress, contentType) {
    var req = new XMLHttpRequest();

    if(onProgress) {
      req.addEventListener('progress', function(event) {
        onProgress(event.loaded, event.total);
      }, false);
    }

    req.onerror = function(event) {
      Util.error('Network error.');
    };

    req.onload = function() {
      var contentType = contentType || this.getResponseHeader('content-type');
      switch(this.status) {
        case 500:
        case 404:
          onComplete(this.statusText, this.status);
          break;
        case 304:
        default:
          onComplete(parseResponse(contentType, this.responseText), this.status);
      }
    };

    req.open('get', url, true);
    req.send();
  }

  function register(key, depsOrFunc, funcOrScope, scope) {
    // register a new module (with dependencies)
    if(Util.isArray(depsOrFunc) && Util.isFunction(funcOrScope)) {
      Injector.register(key, depsOrFunc, funcOrScope, scope);
    } 
     // register a new module (without dependencies)
    else if(Util.isFunction(depsOrFunc)) {
      Injector.register(key, [], depsOrFunc, funcOrScope);
    }
  }

  core = function() {};

  core.use = function(depsOrFunc, funcOrScope, scope, cb) {
    var result;
    // one dependency
    if(Util.isString(depsOrFunc)) {
      Injector.resolveAndApply([depsOrFunc], funcOrScope, scope, cb);
    }
    // multiple dependencies
    else if (Util.isArray(depsOrFunc)) {
      Injector.resolveAndApply(depsOrFunc, funcOrScope, scope, cb);
    } 
    // no dependencies
    else if(Util.isFunction(depsOrFunc)) {
      result = Injector.apply([], depsOrFunc, funcOrScope);
      if(cb) {
        cb(result);
      }
    }
  };

  core.use.defer = function(depsOrFunc, funcOrScope, scope) {
    return function(cb) {
      core.use(depsOrFunc, funcOrScope, scope, cb);
    };
  };

  core.use.run = function(dep, scope) {
    var cb, done, result;
    var func = function() {
      var args = arguments;

      core.use(dep, function(dep) {
        if(Util.isFunction(dep)) {
          result = dep.apply(null, args);
          if(cb) {
            cb(result);
          }
          done = true;
          return result;
        }
      }, scope);

      return { 
        on: function(_cb) {
          if(done) {
            _cb(result);
          } else {
            cb = _cb;
          }      
        }
      };
    };

    return func;
  };

  core.register = function(key, depsOrFunc, funcOrScope, scope) {
    if(Util.isFunction(depsOrFunc) || Util.isFunction(funcOrScope)) {
      return register(key, depsOrFunc, funcOrScope, scope);
    }
    return {
      depends: function() {
        depsOrFunc = Util.argsToArray(arguments);
        return this;
      },
      factory: function(func, scope) {
        register(key, depsOrFunc, func, scope)
      }
    };
  };

  core.unresolve = function(key) {
    Injector.unresolve(key);
  };

  core.noConflict = function() {
    window[id] = previousOwner;
    return core;
  };
  core.onDocumentReady = onDocumentReady;
  core.log = true;

  /** add these basic modules to the injector */
  Injector
    .setModule('Util', Util)
    .setModule('Injector', Injector)
    .setModule('element', getElement)
    .setModule('registerAll', registerDefinitionObject)
    .setModule('httpGet', httpGet)
    .setModule('appConfig', appConfig);

  /** create global references to core */
  if(window[id]) {
    Util.warn('a preexisting value at namespace \'' + id + '\' has been overwritten.');
    previousOwner = window[id];
  }
  window[id] = core;
  if(!window.register) window.register = core.register;
  if(!window.use) window.use = core.use;

  return core;
})('kilo');
/**
 * Created by Shaun on 10/18/14.
 */

register('Canvas', [], function() {
  'use strict';

  return {
    clearContext: function(context, width, height) {
      context.clearRect(0, 0, width, height);
    },
    drawBackground: function(context, width, height, x, y, color) {
      context.fillStyle = color || 'red';
      context.fillRect(x || 0, y || 0, width, height);
    },
    drawBorder: function(context, width, height, x, y, color) {
      context.beginPath();
      context.strokeStyle = color || 'black';
      context.rect(x || 0, y || 0, width, height);
      context.stroke();
      context.closePath();
    }
  };
});
/**
 * Created by Shaun on 8/3/14.
 */

register('Factory', ['Obj', 'Pool'], function(Obj, Pool) {
  'use strict';

  return function(TypeObject) {
    //var newObject = Pool.getObject();
    //return Obj.mixin([TypeObject, newObject]); // FIXME: mixin still auto-creates an empty object
    var newObject = Obj.mixin([TypeObject]);
    return newObject;
  };
});
/**
 * Created by Shaun on 7/6/14.
 */

register('Func', [], function() {
  'use strict';

  function partial(f) {
    var boundArgs = Array.prototype.slice.call(arguments, 1);
    return function() {
      var defaultArgs = boundArgs.slice();
      for(var i = 0; i < arguments.length; i++) {
        defaultArgs.push(arguments[i]);
      }
      return f.apply(this, defaultArgs);
    };
  }

  function wrap(f, wrapper) {
    return partial(wrapper, f);
  }

  function fastPartial(f) {
    return function() {
      var boundArgs =  Array.prototype.slice.call(arguments);
      var lastIndex = boundArgs.length;
      return function(val) {
        boundArgs[lastIndex] = val;
        return f.apply(this, boundArgs);
      };
    };
  }

  return {
    partial: partial,
    fastPartial: fastPartial,
    wrap: wrap
  };
});
/**
 * Created by Shaun on 6/4/14.
 */

register('HashArray', function() {
  'use strict';

  function HashArray() {
    this.values = [];
    this.keyMap = {};
  }

  function realignDown(keyMap, removedIndex) {
    var key;
    for(key in keyMap) {
      if(keyMap.hasOwnProperty(key) && keyMap[key] > removedIndex) {
        keyMap[key]--;
      }
    }
  }

  function realignUp(keyMap, splicedIndex) {
    var key;
    for(key in keyMap) {
      if(keyMap.hasOwnProperty(key) && keyMap[key] >= splicedIndex) {
        keyMap[key]++;
      }
    }
  }

  HashArray.prototype.set = function(key, value) {
    if(this.keyMap[key]) {
      this.values[this.keyMap[key]] = value;
      return true;
    } else {
      this.values.push(value);
      this.keyMap[key] = this.values.length - 1;
      return false;
    }
  };

  HashArray.prototype.splice = function(targetId, key, value) {
    var index = this.keyMap[targetId] + 1;
    this.values.splice(index, 0, value);
    realignUp(this.keyMap, index);
    this.keyMap[key] = index;
  };

  HashArray.prototype.get = function(key) {
    return this.values[this.keyMap[key]];
  };

  HashArray.prototype.remove = function(key) {
    var index = this.keyMap[key];
    this.values.splice(index, 1);
    realignDown(this.keyMap, index);
    delete this.keyMap[key];
  };

  HashArray.prototype.removeAll = function() {
    var keyMap = this.keyMap, key;
    this.values.length = 0;
    for(key in keyMap) {
      delete keyMap[key];
    }
  };

  HashArray.prototype.getIdByIndex = function(index) {
    var keyMap = this.keyMap, key;
    for(key in keyMap) {
      if(keyMap[key] === index) {
        return key;
      }
    }
    return '';
  };

  HashArray.prototype.getKeys = function() {
    var i, numItems = this.size(), result = [];
    for(i = 0; i < numItems; i++) {
      result.push(this.getIdByIndex(i));
    }
    return result;
  };

  HashArray.prototype.getValues = function() {
    return this.values;
  };

  HashArray.prototype.size = function() {
    return this.values.length;
  };

  return HashArray;
});
/**
 * Created by Shaun on 7/3/14.
 *
 * This is a decorator for HashArray. It adds automatic id management.
 */

register('KeyStore', ['HashArray', 'Util'], function(HashArray, Util) {
  'use strict';

  function KeyStore() {
    this.lastId = 0;
    this.store = new HashArray();
  }

  KeyStore.prototype.get = function(id) {
    return this.store.get(id);
  };

  KeyStore.prototype.set = function(valOrId, val) {
    var id;
    if(Util.isDefined(val)) {
      id = valOrId || this.lastId++;
    } else {
      id = this.lastId++;
      val = valOrId;
    }
    this.store.add(id, val);
    return id;
  };

  KeyStore.prototype.setGroup = function(valOrId, val) {
    var id, values;
    if(Util.isDefined(val)) {
      id = valOrId;
      if(Util.isDefined(id)) {
        values = this.get(id);
      } else {
        id = this.lastId++;
        values = [];
        this.store.add(id, values);
      }
    } else {
      id = this.lastId++;
      val = valOrId;
      values = [];
      this.store.add(id, values);
    }

    if(values) {
      values.push(val);
    } else {
      console.error('Jack2d: keyStore: id \''+ id + '\' not found.');
    }

    return id;
  };

  KeyStore.prototype.clear = function(id) {
    if(Util.isDefined(id)) {
      this.store.remove(id);
    } else {
      this.store.removeAll();
    }
  };

  KeyStore.prototype.getItems = function() {
    return this.store.items;
  };

  return KeyStore;
});
/**
 * Created by Shaun on 11/2/2014.
 */

register('Merge', ['Obj'], function(Obj) {
  'use strict';

  return Obj.merge.bind(Obj);
});

/**
 * Created by Shaun on 6/28/14.
 */

register('Obj', ['Injector', 'Util', 'Func', 'Pool'], function(Injector, Util, Func, Pool) {
  'use strict';

  function mergeObject(source, destination, allowWrap, exceptionOnCollisions) {
    source = source || Pool.getObject();
    destination = destination || Pool.getObject();

    Object.keys(source).forEach(function(prop) {
      assignProperty(source, destination, prop, allowWrap, exceptionOnCollisions);
    });

    return destination;
  }

  function assignProperty(source, destination, prop, allowWrap, exceptionOnCollisions) {
    if(destination.hasOwnProperty(prop)) {
      if(allowWrap) {
        destination[prop] = Func.wrap(destination[prop], source[prop]);
        Util.log('Merge: wrapped \'' + prop + '\'');
      } else if(exceptionOnCollisions) {
        Util.error('Failed to merge mixin. Method \'' +
          prop + '\' caused a name collision.');
      } else {
        destination[prop] = source[prop];
        Util.log('Merge: overwrote \'' + prop + '\'');
      }
    } else {
      destination[prop] = source[prop];
    }

    return destination;
  }

  function augmentMethods(targetObject, augmenter) {
    var newObject = {}; // FIXME: use pooling?

    Object.keys(targetObject).forEach(function(prop) {
      if(!Util.isFunction(targetObject[prop])) {
        return;
      }
      newObject[prop] = augmentMethod(targetObject[prop], targetObject, augmenter);
    });

    return newObject;
  }

  function augmentMethod(method, context, augmenter) {
    return function() {
      var args = Util.argsToArray(arguments);
      if(augmenter) {
        args.unshift(method);
        return augmenter.apply(context, args);
      } else {
        return method.apply(context, args);
      }
    };
  }

  function replaceMethod(context, oldMethod, newMethod, message) {
    Object.keys(context).forEach(function(prop) {
      if(context[prop] === oldMethod) {
        context[prop] = newMethod;
      }
    });
  }

  function augment(obj, augmenter) {
    return augmentMethods(obj, augmenter);
  }

  function quickClone(obj) {
    return quickMerge(obj);
  }

  function quickMerge(source, destination) {
    var prop;
    destination = destination || Pool.getObject();
    for(prop in source) {
      if(source.hasOwnProperty(prop)) {
        destination[prop] = source[prop];
      }
    }
    return destination;
  }

  function print(obj) {
    var prop, str = '';
    if(Util.isObject(obj)) {
      for(prop in obj) {
        if(obj.hasOwnProperty(prop) && !Util.isFunction(obj[prop])) {
          str += prop + ': ' + obj[prop] + '<br>';
        }
      }
    }
    return str;
  }

  function clear(obj) {
    var prop;
    for(prop in obj) {
      if(obj.hasOwnProperty(prop)) {
        delete obj[prop];
      }
    }
    return obj;
  }

  function clone(obj) {
    return merge(obj);
  }

  function merge(source, destination, exceptionOnCollisions) {
    Injector.process(source, function(sourceObj) {
      destination = mergeObject(sourceObj, destination, false, exceptionOnCollisions);
    });

    return destination;
  }

  function wrap(source, destination) {
    Injector.process(source, function(sourceObj) {
      destination = mergeObject(sourceObj, destination, true);
    });

    return destination;
  }

  return {
    print: print,
    clear: clear,
    clone: clone,
    quickClone: quickClone,
    merge: merge,
    quickMerge: quickMerge,
    wrap: wrap,
    augment: augment,
    replaceMethod: replaceMethod
  };
});
/**
 * Created by Shaun on 7/4/14.
 */

register('Pool', [], function() {
  'use strict';

  var objects = [];

  function getObject() {
    var newObject = objects.pop();
    if(!newObject) {
      newObject = {};
    }
    return newObject;
  }

  // FIXME: replace with Obj.clear()
  function clearObject(obj) {
    var prop;
    for(prop in obj) {
      if(obj.hasOwnProperty(prop)) {
        delete obj[prop];
      }
    }
    return obj;
  }

  function killObject(unusedObject) {
    objects.push(clearObject(unusedObject));
  }

  function available() {
    return objects.length;
  }

  return {
    getObject: getObject,
    killObject: killObject,
    available: available
  };
});
/**
 * Created by Shaun on 7/16/14.
 */

register('rect', [], function() {
  'use strict';

  function containsPoint(x, y, rect) {
    return !(x < rect.left || x > rect.right ||
      y < rect.top || y > rect.bottom);
  }

  function containsRect(inner, outer) {
    return !(inner.left < outer.left ||
      inner.right > outer.right ||
      inner.top < outer.top ||
      inner.bottom > outer.bottom);
  }

  // WTF?
  function containsRectX(inner, outer) {
    var contains = !(inner.left < outer.left || inner.right > outer.right);
    return (contains) ? false : inner.left - outer.left;
  }

  function containsX(x, outer) {
    return !(x < outer.left || x > outer.right);
  }

  // WTF?
  function containsRectY(inner, outer) {
    var contains = !(inner.top < outer.top || inner.bottom > outer.bottom);
    return (contains) ? false : inner.top - outer.top;
  }

  function containsY(y, outer) {
    return !(y < outer.top || y > outer.bottom);
  }

  function intersectsRectX(r1, r2) {
    var intersects = !(r2.left >= r1.right || r2.right <= r1.left);
    return (intersects) ? r1.left - r2.left : false;
  }

  function intersectsRectY(r1, r2) {
    var intersects = !(r2.top >= r1.bottom || r2.bottom <= r1.top);
    return (intersects) ? r1.top - r2.top : false;
  }

  return {
    setLeft: function(left) {
      this.left = left;
      return this;
    },
    setTop: function(top) {
      this.top = top;
      return this;
    },
    setRight: function(right) {
      this.right = right;
      return this;
    },
    setBottom: function(bottom) {
      this.bottom = bottom;
      return this;
    },
    containsPoint: containsPoint,
    containsRect: containsRect,
    containsX: containsX,
    containsY: containsY,
    containsRectX: containsRectX,
    containsRectY: containsRectY,
    intersectsRectX: intersectsRectX,
    intersectsRectY: intersectsRectY
  };
});
/**
 * Created by Shaun on 1/10/15.
 */

register('Str', [], function() {
  'use strict';

  function sprintf() {
    var str, replacements;

    str = arguments[0],
    replacements = Array.prototype.slice.call(arguments, 1);

    replacements.forEach(function(replacement) {
      str = str.replace('%%', replacement);
    });

    return str;
  }

  return {
    sprintf: sprintf
  };
});
/**
 * Created by Shaun on 11/2/2014.
 */

register('Wrap', ['Obj'], function(Obj) {
  'use strict';

  return Obj.wrap.bind(Obj);
});
// Production steps of ECMA-262, Edition 5, 15.4.4.18
// Reference: http://es5.github.io/#x15.4.4.18
if (!Array.prototype.forEach) {

  Array.prototype.forEach = function(callback, thisArg) {

    var T, k;

    if (this == null) {
      throw new TypeError(' this is null or not defined');
    }

    // 1. Let O be the result of calling ToObject passing the |this| value as the argument.
    var O = Object(this);

    // 2. Let lenValue be the result of calling the Get internal method of O with the argument "length".
    // 3. Let len be ToUint32(lenValue).
    var len = O.length >>> 0;

    // 4. If IsCallable(callback) is false, throw a TypeError exception.
    // See: http://es5.github.com/#x9.11
    if (typeof callback !== "function") {
      throw new TypeError(callback + ' is not a function');
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    if (arguments.length > 1) {
      T = thisArg;
    }

    // 6. Let k be 0
    k = 0;

    // 7. Repeat, while k < len
    while (k < len) {

      var kValue;

      // a. Let Pk be ToString(k).
      //   This is implicit for LHS operands of the in operator
      // b. Let kPresent be the result of calling the HasProperty internal method of O with argument Pk.
      //   This step can be combined with c
      // c. If kPresent is true, then
      if (k in O) {

        // i. Let kValue be the result of calling the Get internal method of O with argument Pk.
        kValue = O[k];

        // ii. Call the Call internal method of callback with T as the this value and
        // argument list containing kValue, k, and O.
        callback.call(T, kValue, k, O);
      }
      // d. Increase k by 1.
      k++;
    }
    // 8. return undefined
  };
}
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/jakearchibald/es6-promise/master/LICENSE
 * @version   2.0.0
 */

(function() {
    "use strict";

    function $$utils$$objectOrFunction(x) {
      return typeof x === 'function' || (typeof x === 'object' && x !== null);
    }

    function $$utils$$isFunction(x) {
      return typeof x === 'function';
    }

    function $$utils$$isMaybeThenable(x) {
      return typeof x === 'object' && x !== null;
    }

    var $$utils$$_isArray;

    if (!Array.isArray) {
      $$utils$$_isArray = function (x) {
        return Object.prototype.toString.call(x) === '[object Array]';
      };
    } else {
      $$utils$$_isArray = Array.isArray;
    }

    var $$utils$$isArray = $$utils$$_isArray;
    var $$utils$$now = Date.now || function() { return new Date().getTime(); };
    function $$utils$$F() { }

    var $$utils$$o_create = (Object.create || function (o) {
      if (arguments.length > 1) {
        throw new Error('Second argument not supported');
      }
      if (typeof o !== 'object') {
        throw new TypeError('Argument must be an object');
      }
      $$utils$$F.prototype = o;
      return new $$utils$$F();
    });

    var $$asap$$len = 0;

    var $$asap$$default = function asap(callback, arg) {
      $$asap$$queue[$$asap$$len] = callback;
      $$asap$$queue[$$asap$$len + 1] = arg;
      $$asap$$len += 2;
      if ($$asap$$len === 2) {
        // If len is 1, that means that we need to schedule an async flush.
        // If additional callbacks are queued before the queue is flushed, they
        // will be processed by this flush that we are scheduling.
        $$asap$$scheduleFlush();
      }
    };

    var $$asap$$browserGlobal = (typeof window !== 'undefined') ? window : {};
    var $$asap$$BrowserMutationObserver = $$asap$$browserGlobal.MutationObserver || $$asap$$browserGlobal.WebKitMutationObserver;

    // test for web worker but not in IE10
    var $$asap$$isWorker = typeof Uint8ClampedArray !== 'undefined' &&
      typeof importScripts !== 'undefined' &&
      typeof MessageChannel !== 'undefined';

    // node
    function $$asap$$useNextTick() {
      return function() {
        process.nextTick($$asap$$flush);
      };
    }

    function $$asap$$useMutationObserver() {
      var iterations = 0;
      var observer = new $$asap$$BrowserMutationObserver($$asap$$flush);
      var node = document.createTextNode('');
      observer.observe(node, { characterData: true });

      return function() {
        node.data = (iterations = ++iterations % 2);
      };
    }

    // web worker
    function $$asap$$useMessageChannel() {
      var channel = new MessageChannel();
      channel.port1.onmessage = $$asap$$flush;
      return function () {
        channel.port2.postMessage(0);
      };
    }

    function $$asap$$useSetTimeout() {
      return function() {
        setTimeout($$asap$$flush, 1);
      };
    }

    var $$asap$$queue = new Array(1000);

    function $$asap$$flush() {
      for (var i = 0; i < $$asap$$len; i+=2) {
        var callback = $$asap$$queue[i];
        var arg = $$asap$$queue[i+1];

        callback(arg);

        $$asap$$queue[i] = undefined;
        $$asap$$queue[i+1] = undefined;
      }

      $$asap$$len = 0;
    }

    var $$asap$$scheduleFlush;

    // Decide what async method to use to triggering processing of queued callbacks:
    if (typeof process !== 'undefined' && {}.toString.call(process) === '[object process]') {
      $$asap$$scheduleFlush = $$asap$$useNextTick();
    } else if ($$asap$$BrowserMutationObserver) {
      $$asap$$scheduleFlush = $$asap$$useMutationObserver();
    } else if ($$asap$$isWorker) {
      $$asap$$scheduleFlush = $$asap$$useMessageChannel();
    } else {
      $$asap$$scheduleFlush = $$asap$$useSetTimeout();
    }

    function $$$internal$$noop() {}
    var $$$internal$$PENDING   = void 0;
    var $$$internal$$FULFILLED = 1;
    var $$$internal$$REJECTED  = 2;
    var $$$internal$$GET_THEN_ERROR = new $$$internal$$ErrorObject();

    function $$$internal$$selfFullfillment() {
      return new TypeError("You cannot resolve a promise with itself");
    }

    function $$$internal$$cannotReturnOwn() {
      return new TypeError('A promises callback cannot return that same promise.')
    }

    function $$$internal$$getThen(promise) {
      try {
        return promise.then;
      } catch(error) {
        $$$internal$$GET_THEN_ERROR.error = error;
        return $$$internal$$GET_THEN_ERROR;
      }
    }

    function $$$internal$$tryThen(then, value, fulfillmentHandler, rejectionHandler) {
      try {
        then.call(value, fulfillmentHandler, rejectionHandler);
      } catch(e) {
        return e;
      }
    }

    function $$$internal$$handleForeignThenable(promise, thenable, then) {
       $$asap$$default(function(promise) {
        var sealed = false;
        var error = $$$internal$$tryThen(then, thenable, function(value) {
          if (sealed) { return; }
          sealed = true;
          if (thenable !== value) {
            $$$internal$$resolve(promise, value);
          } else {
            $$$internal$$fulfill(promise, value);
          }
        }, function(reason) {
          if (sealed) { return; }
          sealed = true;

          $$$internal$$reject(promise, reason);
        }, 'Settle: ' + (promise._label || ' unknown promise'));

        if (!sealed && error) {
          sealed = true;
          $$$internal$$reject(promise, error);
        }
      }, promise);
    }

    function $$$internal$$handleOwnThenable(promise, thenable) {
      if (thenable._state === $$$internal$$FULFILLED) {
        $$$internal$$fulfill(promise, thenable._result);
      } else if (promise._state === $$$internal$$REJECTED) {
        $$$internal$$reject(promise, thenable._result);
      } else {
        $$$internal$$subscribe(thenable, undefined, function(value) {
          $$$internal$$resolve(promise, value);
        }, function(reason) {
          $$$internal$$reject(promise, reason);
        });
      }
    }

    function $$$internal$$handleMaybeThenable(promise, maybeThenable) {
      if (maybeThenable.constructor === promise.constructor) {
        $$$internal$$handleOwnThenable(promise, maybeThenable);
      } else {
        var then = $$$internal$$getThen(maybeThenable);

        if (then === $$$internal$$GET_THEN_ERROR) {
          $$$internal$$reject(promise, $$$internal$$GET_THEN_ERROR.error);
        } else if (then === undefined) {
          $$$internal$$fulfill(promise, maybeThenable);
        } else if ($$utils$$isFunction(then)) {
          $$$internal$$handleForeignThenable(promise, maybeThenable, then);
        } else {
          $$$internal$$fulfill(promise, maybeThenable);
        }
      }
    }

    function $$$internal$$resolve(promise, value) {
      if (promise === value) {
        $$$internal$$reject(promise, $$$internal$$selfFullfillment());
      } else if ($$utils$$objectOrFunction(value)) {
        $$$internal$$handleMaybeThenable(promise, value);
      } else {
        $$$internal$$fulfill(promise, value);
      }
    }

    function $$$internal$$publishRejection(promise) {
      if (promise._onerror) {
        promise._onerror(promise._result);
      }

      $$$internal$$publish(promise);
    }

    function $$$internal$$fulfill(promise, value) {
      if (promise._state !== $$$internal$$PENDING) { return; }

      promise._result = value;
      promise._state = $$$internal$$FULFILLED;

      if (promise._subscribers.length === 0) {
      } else {
        $$asap$$default($$$internal$$publish, promise);
      }
    }

    function $$$internal$$reject(promise, reason) {
      if (promise._state !== $$$internal$$PENDING) { return; }
      promise._state = $$$internal$$REJECTED;
      promise._result = reason;

      $$asap$$default($$$internal$$publishRejection, promise);
    }

    function $$$internal$$subscribe(parent, child, onFulfillment, onRejection) {
      var subscribers = parent._subscribers;
      var length = subscribers.length;

      parent._onerror = null;

      subscribers[length] = child;
      subscribers[length + $$$internal$$FULFILLED] = onFulfillment;
      subscribers[length + $$$internal$$REJECTED]  = onRejection;

      if (length === 0 && parent._state) {
        $$asap$$default($$$internal$$publish, parent);
      }
    }

    function $$$internal$$publish(promise) {
      var subscribers = promise._subscribers;
      var settled = promise._state;

      if (subscribers.length === 0) { return; }

      var child, callback, detail = promise._result;

      for (var i = 0; i < subscribers.length; i += 3) {
        child = subscribers[i];
        callback = subscribers[i + settled];

        if (child) {
          $$$internal$$invokeCallback(settled, child, callback, detail);
        } else {
          callback(detail);
        }
      }

      promise._subscribers.length = 0;
    }

    function $$$internal$$ErrorObject() {
      this.error = null;
    }

    var $$$internal$$TRY_CATCH_ERROR = new $$$internal$$ErrorObject();

    function $$$internal$$tryCatch(callback, detail) {
      try {
        return callback(detail);
      } catch(e) {
        $$$internal$$TRY_CATCH_ERROR.error = e;
        return $$$internal$$TRY_CATCH_ERROR;
      }
    }

    function $$$internal$$invokeCallback(settled, promise, callback, detail) {
      var hasCallback = $$utils$$isFunction(callback),
          value, error, succeeded, failed;

      if (hasCallback) {
        value = $$$internal$$tryCatch(callback, detail);

        if (value === $$$internal$$TRY_CATCH_ERROR) {
          failed = true;
          error = value.error;
          value = null;
        } else {
          succeeded = true;
        }

        if (promise === value) {
          $$$internal$$reject(promise, $$$internal$$cannotReturnOwn());
          return;
        }

      } else {
        value = detail;
        succeeded = true;
      }

      if (promise._state !== $$$internal$$PENDING) {
        // noop
      } else if (hasCallback && succeeded) {
        $$$internal$$resolve(promise, value);
      } else if (failed) {
        $$$internal$$reject(promise, error);
      } else if (settled === $$$internal$$FULFILLED) {
        $$$internal$$fulfill(promise, value);
      } else if (settled === $$$internal$$REJECTED) {
        $$$internal$$reject(promise, value);
      }
    }

    function $$$internal$$initializePromise(promise, resolver) {
      try {
        resolver(function resolvePromise(value){
          $$$internal$$resolve(promise, value);
        }, function rejectPromise(reason) {
          $$$internal$$reject(promise, reason);
        });
      } catch(e) {
        $$$internal$$reject(promise, e);
      }
    }

    function $$$enumerator$$makeSettledResult(state, position, value) {
      if (state === $$$internal$$FULFILLED) {
        return {
          state: 'fulfilled',
          value: value
        };
      } else {
        return {
          state: 'rejected',
          reason: value
        };
      }
    }

    function $$$enumerator$$Enumerator(Constructor, input, abortOnReject, label) {
      this._instanceConstructor = Constructor;
      this.promise = new Constructor($$$internal$$noop, label);
      this._abortOnReject = abortOnReject;

      if (this._validateInput(input)) {
        this._input     = input;
        this.length     = input.length;
        this._remaining = input.length;

        this._init();

        if (this.length === 0) {
          $$$internal$$fulfill(this.promise, this._result);
        } else {
          this.length = this.length || 0;
          this._enumerate();
          if (this._remaining === 0) {
            $$$internal$$fulfill(this.promise, this._result);
          }
        }
      } else {
        $$$internal$$reject(this.promise, this._validationError());
      }
    }

    $$$enumerator$$Enumerator.prototype._validateInput = function(input) {
      return $$utils$$isArray(input);
    };

    $$$enumerator$$Enumerator.prototype._validationError = function() {
      return new Error('Array Methods must be provided an Array');
    };

    $$$enumerator$$Enumerator.prototype._init = function() {
      this._result = new Array(this.length);
    };

    var $$$enumerator$$default = $$$enumerator$$Enumerator;

    $$$enumerator$$Enumerator.prototype._enumerate = function() {
      var length  = this.length;
      var promise = this.promise;
      var input   = this._input;

      for (var i = 0; promise._state === $$$internal$$PENDING && i < length; i++) {
        this._eachEntry(input[i], i);
      }
    };

    $$$enumerator$$Enumerator.prototype._eachEntry = function(entry, i) {
      var c = this._instanceConstructor;
      if ($$utils$$isMaybeThenable(entry)) {
        if (entry.constructor === c && entry._state !== $$$internal$$PENDING) {
          entry._onerror = null;
          this._settledAt(entry._state, i, entry._result);
        } else {
          this._willSettleAt(c.resolve(entry), i);
        }
      } else {
        this._remaining--;
        this._result[i] = this._makeResult($$$internal$$FULFILLED, i, entry);
      }
    };

    $$$enumerator$$Enumerator.prototype._settledAt = function(state, i, value) {
      var promise = this.promise;

      if (promise._state === $$$internal$$PENDING) {
        this._remaining--;

        if (this._abortOnReject && state === $$$internal$$REJECTED) {
          $$$internal$$reject(promise, value);
        } else {
          this._result[i] = this._makeResult(state, i, value);
        }
      }

      if (this._remaining === 0) {
        $$$internal$$fulfill(promise, this._result);
      }
    };

    $$$enumerator$$Enumerator.prototype._makeResult = function(state, i, value) {
      return value;
    };

    $$$enumerator$$Enumerator.prototype._willSettleAt = function(promise, i) {
      var enumerator = this;

      $$$internal$$subscribe(promise, undefined, function(value) {
        enumerator._settledAt($$$internal$$FULFILLED, i, value);
      }, function(reason) {
        enumerator._settledAt($$$internal$$REJECTED, i, reason);
      });
    };

    var $$promise$all$$default = function all(entries, label) {
      return new $$$enumerator$$default(this, entries, true /* abort on reject */, label).promise;
    };

    var $$promise$race$$default = function race(entries, label) {
      /*jshint validthis:true */
      var Constructor = this;

      var promise = new Constructor($$$internal$$noop, label);

      if (!$$utils$$isArray(entries)) {
        $$$internal$$reject(promise, new TypeError('You must pass an array to race.'));
        return promise;
      }

      var length = entries.length;

      function onFulfillment(value) {
        $$$internal$$resolve(promise, value);
      }

      function onRejection(reason) {
        $$$internal$$reject(promise, reason);
      }

      for (var i = 0; promise._state === $$$internal$$PENDING && i < length; i++) {
        $$$internal$$subscribe(Constructor.resolve(entries[i]), undefined, onFulfillment, onRejection);
      }

      return promise;
    };

    var $$promise$resolve$$default = function resolve(object, label) {
      /*jshint validthis:true */
      var Constructor = this;

      if (object && typeof object === 'object' && object.constructor === Constructor) {
        return object;
      }

      var promise = new Constructor($$$internal$$noop, label);
      $$$internal$$resolve(promise, object);
      return promise;
    };

    var $$promise$reject$$default = function reject(reason, label) {
      /*jshint validthis:true */
      var Constructor = this;
      var promise = new Constructor($$$internal$$noop, label);
      $$$internal$$reject(promise, reason);
      return promise;
    };

    var $$es6$promise$promise$$counter = 0;

    function $$es6$promise$promise$$needsResolver() {
      throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
    }

    function $$es6$promise$promise$$needsNew() {
      throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
    }

    var $$es6$promise$promise$$default = $$es6$promise$promise$$Promise;

    /**
      Promise objects represent the eventual result of an asynchronous operation. The
      primary way of interacting with a promise is through its `then` method, which
      registers callbacks to receive either a promiseâ€™s eventual value or the reason
      why the promise cannot be fulfilled.

      Terminology
      -----------

      - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
      - `thenable` is an object or function that defines a `then` method.
      - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
      - `exception` is a value that is thrown using the throw statement.
      - `reason` is a value that indicates why a promise was rejected.
      - `settled` the final resting state of a promise, fulfilled or rejected.

      A promise can be in one of three states: pending, fulfilled, or rejected.

      Promises that are fulfilled have a fulfillment value and are in the fulfilled
      state.  Promises that are rejected have a rejection reason and are in the
      rejected state.  A fulfillment value is never a thenable.

      Promises can also be said to *resolve* a value.  If this value is also a
      promise, then the original promise's settled state will match the value's
      settled state.  So a promise that *resolves* a promise that rejects will
      itself reject, and a promise that *resolves* a promise that fulfills will
      itself fulfill.


      Basic Usage:
      ------------

      ```js
      var promise = new Promise(function(resolve, reject) {
        // on success
        resolve(value);

        // on failure
        reject(reason);
      });

      promise.then(function(value) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Advanced Usage:
      ---------------

      Promises shine when abstracting away asynchronous interactions such as
      `XMLHttpRequest`s.

      ```js
      function getJSON(url) {
        return new Promise(function(resolve, reject){
          var xhr = new XMLHttpRequest();

          xhr.open('GET', url);
          xhr.onreadystatechange = handler;
          xhr.responseType = 'json';
          xhr.setRequestHeader('Accept', 'application/json');
          xhr.send();

          function handler() {
            if (this.readyState === this.DONE) {
              if (this.status === 200) {
                resolve(this.response);
              } else {
                reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
              }
            }
          };
        });
      }

      getJSON('/posts.json').then(function(json) {
        // on fulfillment
      }, function(reason) {
        // on rejection
      });
      ```

      Unlike callbacks, promises are great composable primitives.

      ```js
      Promise.all([
        getJSON('/posts'),
        getJSON('/comments')
      ]).then(function(values){
        values[0] // => postsJSON
        values[1] // => commentsJSON

        return values;
      });
      ```

      @class Promise
      @param {function} resolver
      Useful for tooling.
      @constructor
    */
    function $$es6$promise$promise$$Promise(resolver) {
      this._id = $$es6$promise$promise$$counter++;
      this._state = undefined;
      this._result = undefined;
      this._subscribers = [];

      if ($$$internal$$noop !== resolver) {
        if (!$$utils$$isFunction(resolver)) {
          $$es6$promise$promise$$needsResolver();
        }

        if (!(this instanceof $$es6$promise$promise$$Promise)) {
          $$es6$promise$promise$$needsNew();
        }

        $$$internal$$initializePromise(this, resolver);
      }
    }

    $$es6$promise$promise$$Promise.all = $$promise$all$$default;
    $$es6$promise$promise$$Promise.race = $$promise$race$$default;
    $$es6$promise$promise$$Promise.resolve = $$promise$resolve$$default;
    $$es6$promise$promise$$Promise.reject = $$promise$reject$$default;

    $$es6$promise$promise$$Promise.prototype = {
      constructor: $$es6$promise$promise$$Promise,

    /**
      The primary way of interacting with a promise is through its `then` method,
      which registers callbacks to receive either a promise's eventual value or the
      reason why the promise cannot be fulfilled.

      ```js
      findUser().then(function(user){
        // user is available
      }, function(reason){
        // user is unavailable, and you are given the reason why
      });
      ```

      Chaining
      --------

      The return value of `then` is itself a promise.  This second, 'downstream'
      promise is resolved with the return value of the first promise's fulfillment
      or rejection handler, or rejected if the handler throws an exception.

      ```js
      findUser().then(function (user) {
        return user.name;
      }, function (reason) {
        return 'default name';
      }).then(function (userName) {
        // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
        // will be `'default name'`
      });

      findUser().then(function (user) {
        throw new Error('Found user, but still unhappy');
      }, function (reason) {
        throw new Error('`findUser` rejected and we're unhappy');
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
        // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
      });
      ```
      If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.

      ```js
      findUser().then(function (user) {
        throw new PedagogicalException('Upstream error');
      }).then(function (value) {
        // never reached
      }).then(function (value) {
        // never reached
      }, function (reason) {
        // The `PedgagocialException` is propagated all the way down to here
      });
      ```

      Assimilation
      ------------

      Sometimes the value you want to propagate to a downstream promise can only be
      retrieved asynchronously. This can be achieved by returning a promise in the
      fulfillment or rejection handler. The downstream promise will then be pending
      until the returned promise is settled. This is called *assimilation*.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // The user's comments are now available
      });
      ```

      If the assimliated promise rejects, then the downstream promise will also reject.

      ```js
      findUser().then(function (user) {
        return findCommentsByAuthor(user);
      }).then(function (comments) {
        // If `findCommentsByAuthor` fulfills, we'll have the value here
      }, function (reason) {
        // If `findCommentsByAuthor` rejects, we'll have the reason here
      });
      ```

      Simple Example
      --------------

      Synchronous Example

      ```javascript
      var result;

      try {
        result = findResult();
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js
      findResult(function(result, err){
        if (err) {
          // failure
        } else {
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findResult().then(function(result){
        // success
      }, function(reason){
        // failure
      });
      ```

      Advanced Example
      --------------

      Synchronous Example

      ```javascript
      var author, books;

      try {
        author = findAuthor();
        books  = findBooksByAuthor(author);
        // success
      } catch(reason) {
        // failure
      }
      ```

      Errback Example

      ```js

      function foundBooks(books) {

      }

      function failure(reason) {

      }

      findAuthor(function(author, err){
        if (err) {
          failure(err);
          // failure
        } else {
          try {
            findBoooksByAuthor(author, function(books, err) {
              if (err) {
                failure(err);
              } else {
                try {
                  foundBooks(books);
                } catch(reason) {
                  failure(reason);
                }
              }
            });
          } catch(error) {
            failure(err);
          }
          // success
        }
      });
      ```

      Promise Example;

      ```javascript
      findAuthor().
        then(findBooksByAuthor).
        then(function(books){
          // found books
      }).catch(function(reason){
        // something went wrong
      });
      ```

      @method then
      @param {Function} onFulfilled
      @param {Function} onRejected
      Useful for tooling.
      @return {Promise}
    */
      then: function(onFulfillment, onRejection) {
        var parent = this;
        var state = parent._state;

        if (state === $$$internal$$FULFILLED && !onFulfillment || state === $$$internal$$REJECTED && !onRejection) {
          return this;
        }

        var child = new this.constructor($$$internal$$noop);
        var result = parent._result;

        if (state) {
          var callback = arguments[state - 1];
          $$asap$$default(function(){
            $$$internal$$invokeCallback(state, child, callback, result);
          });
        } else {
          $$$internal$$subscribe(parent, child, onFulfillment, onRejection);
        }

        return child;
      },

    /**
      `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
      as the catch block of a try/catch statement.

      ```js
      function findAuthor(){
        throw new Error('couldn't find that author');
      }

      // synchronous
      try {
        findAuthor();
      } catch(reason) {
        // something went wrong
      }

      // async with promises
      findAuthor().catch(function(reason){
        // something went wrong
      });
      ```

      @method catch
      @param {Function} onRejection
      Useful for tooling.
      @return {Promise}
    */
      'catch': function(onRejection) {
        return this.then(null, onRejection);
      }
    };

    var $$es6$promise$polyfill$$default = function polyfill() {
      var local;

      if (typeof global !== 'undefined') {
        local = global;
      } else if (typeof window !== 'undefined' && window.document) {
        local = window;
      } else {
        local = self;
      }

      var es6PromiseSupport =
        "Promise" in local &&
        // Some of these methods are missing from
        // Firefox/Chrome experimental implementations
        "resolve" in local.Promise &&
        "reject" in local.Promise &&
        "all" in local.Promise &&
        "race" in local.Promise &&
        // Older version of the spec had a resolver object
        // as the arg rather than a function
        (function() {
          var resolve;
          new local.Promise(function(r) { resolve = r; });
          return $$utils$$isFunction(resolve);
        }());

      if (!es6PromiseSupport) {
        local.Promise = $$es6$promise$promise$$default;
      }
    };

    var es6$promise$umd$$ES6Promise = {
      'Promise': $$es6$promise$promise$$default,
      'polyfill': $$es6$promise$polyfill$$default
    };

    /* global define:true module:true window: true */
    if (typeof define === 'function' && define['amd']) {
      define(function() { return es6$promise$umd$$ES6Promise; });
    } else if (typeof module !== 'undefined' && module['exports']) {
      module['exports'] = es6$promise$umd$$ES6Promise;
    } else if (typeof this !== 'undefined') {
      this['ES6Promise'] = es6$promise$umd$$ES6Promise;
    }
}).call(this);
/**
 * Created by Shaun on 6/7/14.
 */

register('SchedulerObject', ['Util', 'Scheduler', 'Func'], function(Util, Scheduler, Func) {
  'use strict';

  return {
    onFrame: function(callback, id) {
      var gid = Util.getGID(id);

      if(!this.schedulerIds) {
        this.schedulerIds = [];
      }
      if(!this.hooks) {
        this.hooks = {};
      }

      callback = callback.bind(this);
      if(id) {
        this.hooks[id] = gid;
      }
      this.schedulerIds.push(Scheduler.register(callback, gid));
      return this;
    },
    getSchedulerId: function(hookId) {
      if(!this.hooks) {
        return null;
      }
      return this.hooks[hookId];
    },
    // wraps an existing Scheduler task
    hook: function(id, wrapper) {
      var f, schedulerId = this.getSchedulerId(id);
      if(schedulerId) {
        f = Scheduler.getRegistered(schedulerId);
        f = Func.wrap(f, wrapper);
        Scheduler.register(f, schedulerId);
      }
      return this;
    },
    killOnFrame: function(schedulerId) {
      if(schedulerId) {
        Scheduler.unRegister(schedulerId);
      } else if(this.schedulerIds) {
        this.schedulerIds.forEach(function(schedulerId) {
          Scheduler.unRegister(schedulerId);
        });
      }

      return this;
    }
  };
});
/**
 * Created by Shaun on 5/31/14.
 */

register('Scheduler', ['HashArray', 'Util'], function(HashArray, Util) {
  'use strict';

  var ONE_SECOND = 1000,
    targetFps,
    actualFps,
    ticks,
    running,
    elapsedSeconds,
    registeredCallbacks,
    lastRegisteredId,
    lastUid,
    oneSecondTimerId,
    frameTimerId,
    lastUpdateTime,
    obj;

  init();

  function init() {
    reset();
    start();
    return obj;
  }

  function reset() {
    targetFps = 60;
    actualFps = 0;
    ticks = 0;
    elapsedSeconds = 0;
    lastRegisteredId = 0;
    lastUid = 0;
    registeredCallbacks = new HashArray();
    running = false;
    lastUpdateTime = new Date();
    return obj;
  }

  function register(callback, id) {
    if(!Util.isFunction(callback)) {
      Util.error('Scheduler: only functions can be registered.');
    }
    if(!id) {
      id = Util.getGID(id);
    }

    registeredCallbacks.set(id, callback);

    return id;
  }

  function registerAfter(afterId, callback, id) {
    if(!id) {
      id = lastRegisteredId++;
    }
    registeredCallbacks.splice(afterId, id, callback);
    return id;
  }

  function unRegister(id) {
    registeredCallbacks.remove(id);
    return obj;
  }

  function getRegistered(id) {
    return (id) ? registeredCallbacks.get(id) : registeredCallbacks.getValues();
  }

  function requestNextFrame() {
    frameTimerId = window.requestAnimationFrame(onFrame);
  }

  function registeredCount() {
    return registeredCallbacks.size();
  }

  function start() {
    if(!running) {
      running = true;
      oneSecondTimerId = window.setInterval(onOneSecond, ONE_SECOND);
      onFrame();
    }
    return obj;
  }

  function stop() {
    running = false;
    window.clearInterval(oneSecondTimerId);
    window.cancelAnimationFrame(frameTimerId);
    return obj;
  }

  function onFrame() {
    executeFrameCallbacks(getDeltaTime());
    tick();

    if(running) {
      requestNextFrame();
    }
  }

  function executeFrameCallbacks(deltaTime) {
    var items, numItems, item, i;

    items = registeredCallbacks.getValues();
    numItems = items.length;

    for(i = 0; i < numItems; i++) {
      item = items[i];
      if(item) {
        item(deltaTime);
      }
    }
  }

  function getDeltaTime() {
    var now = +new Date(),
      elapsed = (now - lastUpdateTime) / ONE_SECOND;

    lastUpdateTime = now;

    return elapsed;
  }

  function tick() {
    ticks++;
  }

  function onOneSecond() {
    actualFps = ticks.toString();
    ticks = 0;
    elapsedSeconds++;
  }

  function getFps() {
    return actualFps;
  }

  function getSeconds() {
    return elapsedSeconds;
  }

  obj = {
    __mixin: false,
    init: init,
    reset: reset,
    start: start,
    stop: stop,
    register: register,
    registerAfter: registerAfter,
    unRegister: unRegister,
    getRegistered: getRegistered,
    registeredCount: registeredCount,
    getFps: getFps,
    getSeconds: getSeconds
  };

  return obj;
});
/**
 * Created by Shaun on 5/31/14.

  http://paulirish.com/2011/requestanimationframe-for-smart-animating/
  http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating
 
  requestAnimationFrame polyfill by Erik Möller. fixes from Paul Irish and Tino Zijdel
 
  MIT license
 */

/*(function(frameLength) {
  'use strict';
  var vendors = ['ms', 'moz', 'webkit', 'o'], x;

  for(x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] ||
      window[vendors[x]+'CancelRequestAnimationFrame'];
  }

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function(callback) {
      return window.setTimeout(callback, frameLength);
    };
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function(id) {
      window.clearTimeout(id);
    };
  }
})(62.5);*/

(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] 
                                   || window[vendors[x]+'CancelRequestAnimationFrame'];
    }
 
    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
 
    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
}());
/**
 * Created by Shaun on 11/18/2014.
 */

register('CommandObject', ['Util', 'Obj', 'Injector'], function(Util, Obj, Injector) {
  'use strict';

  function addCommand(context, commandConfig) {
    context.commandRunner.add(commandConfig);
    return context;
  }

  function end() {
    return addCommand(this, {end: true});
  }

  function get(func) {
    var args = Array.prototype.slice.call(arguments, 1);
    return addCommand(this, {
      func: func,
      sourceAsArg: true,
      args: args,
      context: this
    });
  }

  function watch(prop) {
    this.end();
    return addCommand(this, {
      watchProp: prop,
      lastValue: this.commandRunner.context[prop],
      logicals: [],
      specials: []
    });
  }

  function whenGroup(prop, value) {
    this.end();
    return this.when(prop, value, true);
  }

  function endGroup() {
    return addCommand(this, {endGroup: true});
  }

  function when(prop, value, group) {
    this.end();
    return addCommand(this, {
      whenProp: prop,
      whenValue: value,
      isFunc: Util.isFunction(value),
      logicals: [],
      specials: [],
      commands: [],
      group: group
    });
  }

  function whenNot(prop) {
    this.end();
    return this.when(prop, false);
  }

  function andWhen(prop, value) {
    return addCommand(this, {
      isLogical: true,
      logicalProp: prop,
      logicalValue: value,
      logicalType: 'and',
      isFunc: Util.isFunction(value),
      specials: []
    });
  }

  function orWhen(prop, value) {
    return addCommand(this, {
      isLogical: true,
      logicalProp: prop,
      logicalValue: value,
      logicalType: 'or',
      isFunc: Util.isFunction(value),
      specials: []
    });
  }

   function on(eventName, func) {
    this.end();
    return addCommand(this, {
      eventName: eventName,
      func: func
    });
  }

  function set(objOrProp, propOrValue, value) {
    var context, prop;
    if(Util.isDefined(value)) {
      // NOTE: this is an async operation so this set() may run AFTER set() calls that follow it
      Injector.process(objOrProp, function(context) {
        addCommand(this, {
          setProp: propOrValue,
          setValue: value,
          inc: false,
          context: context
        });
      }.bind(this));

      return this;
    } else {
      return addCommand(this, {
        setProp: objOrProp,
        setValue: propOrValue,
        inc: false,
        context: context
      });
    }
  }

  function inc(prop, value, format) {
    return addCommand(this, {
      setProp: prop,
      setValue: value,
      inc: true,
      format: format
    });
  }

  function call(func) {
    var args = Array.prototype.slice.call(arguments, 1);
    return addCommand(this, {
      func: func,
      args: args
    });
  }

  function log(value) {
    return addCommand(this, {
      logValue: value
    });
  }

  function source() {
    return this.commandRunner.context;
  }

  return {
    commandRunner: null,
    logicMode: '',
    end: end,
    get: get,
    watch: watch,
    whenGroup: whenGroup,
    endGroup: endGroup,
    when: when,
    whenNot: whenNot,
    andWhen: andWhen,
    orWhen: orWhen,
    set: set,
    inc: inc,
    on: on,
    call: call,
    log: log,
    source: source
  };
});

/**
 * Created by Shaun on 9/11/14.
 */

register('CommandRunner', ['Util', 'Scheduler'], function(Util, Scheduler) {
  'use strict';

  function getLastObject(obj, propStr) {
    var props = propStr.split('.');
    if(props.length === 1) {
      return obj;
    }
    return getObject(obj, props);

    function getObject(obj, props) {
      if(!obj) {
        return obj;
      } else if(props.length === 2) {
        return obj[props[0]];
      } else {
        return getObject(obj[props[0]], props.slice(1));
      }
    }
  }

  function getLastProp(propStr) {
    return propStr.split('.').slice(-1)[0];
  }

  function CommandRunner(context, chronoId) {
    this.chronoId = chronoId;
    this.context = context;
    this.running = false;
    this.conditional = null;
    this.waitQueue = [];
    this.specialQueue = null;
  }

  CommandRunner.prototype.add = function(command) {
    if(!this.running) {
      this.waitQueue.push(command);   
    } else {
      command = this.preProcessCommand(command);
      this.evaluateCommand(command);
    }
  };

  CommandRunner.prototype.go = function() {
    this.running = true;
    this.evaluateCommands();
  };


  CommandRunner.prototype.preProcessCommand = function(command) {
    if(command.setProp) {
      command.context = getLastObject(command.context || this.context, command.setProp);
      command.setProp = getLastProp(command.setProp);
    }
    else if(command.whenProp) {
      command.context = getLastObject(this.context, command.whenProp);
      command.whenProp = getLastProp(command.whenProp);
    }
    else if(command.watchProp) {
      command.context = getLastObject(this.context, command.watchProp);
      command.whenProp = getLastProp(command.watchProp);
    }
    else if(command.logicalProp) {
      command.context = getLastObject(this.context, command.logicalProp);
      command.logicalProp = getLastProp(command.logicalProp);
    }
    else if(command.eventName) {
      command.context = getLastObject(this.context, command.eventName);
      command.eventName = getLastProp(command.eventName);
    }

    return command;
  };

  CommandRunner.prototype.evaluateCommands = function() {
    var command, waitQueue;
 
    waitQueue = this.waitQueue;

    while(command = waitQueue.shift()) {
      command = this.preProcessCommand(command);
      this.evaluateCommand(command);
    }
  };

  CommandRunner.prototype.evaluateCommand = function(command) {
    if(command.whenProp || command.watchProp) {
      if(!this.specialQueue) {
        this.specialQueue = this.repeatQueue();
      }
      this.specialQueue.push(command);
    } else if(command.eventName) {
      this.specialQueue = this.eventQueue(command);
    } else if(command.end) {
      this.specialQueue = null;
    } else if(this.specialQueue) {
      this.specialQueue.push(command);
    } else {
      return this.executeCommand(command);
    }
    return null;
  };

  CommandRunner.prototype.repeatQueue = function() {
    var repeatQueue = [];

    if(this.chronoId) {
      Scheduler.registerAfter(this.chronoId, function() {
        this.processRepeatCommands(repeatQueue);
      }.bind(this), Util.getGID('command-repeat'));

    } else {
      Scheduler.register(function() {
        this.processRepeatCommands(repeatQueue);
      }.bind(this), Util.getGID('command-repeat'));
    }

    return repeatQueue;
  };

  CommandRunner.prototype.eventQueue = function(command) {
    var eventQueue = [], context = command.context; // || this.context;
    var that = this;
    if(context.addEventListener) {
      context.addEventListener(command.eventName, function(event) {
        var i, numCommands = eventQueue.length;
        if(command.func) {
          command.func.call(command.context, event);
        }
        for(i = 0; i < numCommands; i++) {
          that.executeCommand(eventQueue[i]);
        }
      });
    }

    return eventQueue;
  };


  CommandRunner.prototype.processRepeatCommands = function(commandQueue) {
    var numCommands, command, conditional = null,
      groupConditional = null, i = 0;

    numCommands = commandQueue.length;

    while(i < numCommands) {
      command = commandQueue.shift();
      if(command.group) {
        groupConditional = command;
      } else if(command.endGroup) {
        groupConditional = null;
      } else if(command.whenProp || command.watchProp) {
        conditional = command;
        conditional.logicals.length = 0;
      } else if(conditional && command.isLogical) {
        conditional.logicals.push(command);
      } else if(groupConditional) {
        if(this.evaluateConditional(groupConditional)) {
          if(conditional && this.evaluateConditional(conditional)) {
            this.executeCommand(command);
          }
        }
      } else if(conditional) {
        if(this.evaluateConditional(conditional)) {
          this.executeCommand(command);
        }
      }
      commandQueue.push(command);
      i++;
    }
  };

  CommandRunner.prototype.checkWatch = function(command) {
    var context = command.context; //this.context;
    if(context[command.watchProp] !== command.lastValue) {
      command.lastValue = context[command.watchProp];
      return true;
    }
    return false;
  };

  CommandRunner.prototype.evaluateConditional = function(conditional) {
    var context = conditional.context; //this.context;
    if((conditional.isFunc && conditional.whenValue.call(context, context[conditional.whenProp])) ||
      (conditional.watchProp && this.checkWatch(conditional, context)) ||
      conditional.whenProp && Util.isDefined(conditional.whenValue) && (context[conditional.whenProp] === conditional.whenValue) ||
      conditional.whenProp && !Util.isDefined(conditional.whenValue) && Util.isDefined(context[conditional.whenProp])
    ) {
      if(conditional.logicals.length > 0) {
        return this.evaluateLogical(conditional.logicals, conditional.whenProp || conditional.watchProp, true);
      }
      return true;
    }
    if(conditional.logicals.length > 0) {
      return this.evaluateLogical(conditional.logicals, conditional.whenProp || conditional.watchProp, false);
    }
    return false;
  };

  CommandRunner.prototype.evaluateLogical = function(logicals, logicalProp, logicState) {
    var numLogicals, logical, logicalType, i;
    var context; // = this.context;

    for(i = 0, numLogicals = logicals.length; i < numLogicals; i++) {
      logical = logicals[i];
      logicalType = logical.logicalType;
      logicalProp = logical.logicalProp || logicalProp;
      context = logical.context;
      if(logical.isFunc) {
        if(logical.logicalValue.call(context, context[logicalProp])) {
          if(logicalType === 'or') {
            return true;
          }
        } else if(logicalType === 'and') {
          logicState = false;
        }
      } else {
        if(Util.isDefined(context[logicalProp])) {
          if(logicalType === 'or') {
            return true;
          }
        } else if(logicalType === 'and') {
          logicState = false;
        }
      }
    }
    return logicState;
  };

  CommandRunner.prototype.executeCommand = function(command) {
    var context = command.context, //this.context,
     result, prop, propVal;

    if(command.eventName) {
      if(context.addEventListener) {
        context.addEventListener(command.eventName, command.func);
      }
    } else if(command.func) {
      if(command.sourceAsArg) {
        command.args.unshift(context);
      }
      command.func.apply(command.context || context, command.args);
    } else if(command.logValue) {
      Util.log(command.logValue);
    } else if(command.setProp) {
      prop = command.setProp;
      if(command.inc) {
        // PX
        if(command.format === 'px') {
          if(!command.context[prop]) {
            command.context[prop] = command.setValue + 'px';
          } else {
            propVal = command.context[prop];
            command.context[prop] = parseInt(propVal) + command.setValue + 'px';
          }

        // %
        } else if(command.format === '%') {
          if(!command.context[prop]) {
            command.context[prop] = command.setValue + '%';
          } else {
            propVal = command.context[prop];
            command.context[prop] = parseInt(propVal) + command.setValue + '%';
          }
        // OTHER          
        } else {
          if(!command.context[prop]) {
            command.context[prop] = command.setValue;
          }
          command.context[prop] += command.setValue;
        }
      } else {
        command.context[prop] = command.setValue;
      }
    }
    return result;
  };

  return CommandRunner;
});
/**
 * Created by Shaun on 9/13/14.
 */

kilo('FlowDefinition', ['helper', 'obj', 'FlowObject'], function(Helper, Obj, FlowObject) {
  'use strict';

  // not sure about using this anymore...
  function FlowDefinition(sourceObject) {
    var flowObject = Obj.create(FlowObject);
    return flowObject.init(sourceObject, 1, true); // <-- 'idle' no longer exists
  }

  return FlowDefinition;
});
/**
 * Created by Shaun on 11/18/2014.
 */

use(['Func', 'registerAll'], function(Func, registerAll) {
  'use strict';

  registerAll({
    greaterThan: Func.fastPartial(function(compare, val) {
      return val > compare;
    }),
    lessThan: Func.fastPartial(function(compare, val) {
      return val < compare;
    }),
    between: Func.fastPartial(function(compare1, compare2, val) {
      return (compare1 < val && val < compare2);
    }),
    greaterThanOrEqual: Func.fastPartial(function(compare, val) {
      return val >= compare;
    }),
    lessThanOrEqual: Func.fastPartial(function(compare, val) {
      return val <= compare;
    }),
    betweenInclusive: Func.fastPartial(function(compare1, compare2, val) {
      return (compare1 <= val && val <= compare2);
    }),
    outside: Func.fastPartial(function(compare1, compare2, val) {
      return (val < compare1 && val > compare2);
    }),
    and: Func.fastPartial(function() {
      // val = last arg
      // for each func, pass in val
    })
  });
});

/**
 * Created by Shaun on 8/10/14.
 */

register('FlowObject')
.depends('Util', 'Injector', 'Obj', 'CommandRunner', 'CommandObject')
.factory(function(Util, Injector, Obj, CommandRunner, CommandObject) {
  'use strict';

  function containsProp(prop, targetObject) {
    return (Object.keys(targetObject).indexOf(prop) !== -1); // TODO: add indexOf polyfill
  }

  function attachCommandFunctions(sourceObject, destinationObject) {
    Object.keys(sourceObject).forEach(function(prop) {
      if(!Util.isFunction(sourceObject[prop]) || containsProp(prop, FlowObject)) {
        return;
      }

      if(!destinationObject.__savedFunctions) {
        destinationObject.__savedFunctions = {};
      }
      destinationObject.__savedFunctions[prop] = sourceObject[prop];
      destinationObject[prop] = makeCommandFunction(destinationObject, sourceObject[prop]);
    });
  }

  function makeCommandFunction(commandObject, func) {
    return function() {
      return commandObject.call(func);
    };
  }

  function restoreFunctions(commandObject, targetObject) {
    var savedFunctions = commandObject.__savedFunctions;
    if(savedFunctions) {
      Object.keys(savedFunctions).forEach(function(prop) {
        targetObject[prop] = savedFunctions[prop];
      });
    }
  }

  function removeCommandFunctions(sourceObject, commandObject) {
    Object.keys(sourceObject).forEach(function(prop) {
      if(!Util.isFunction(sourceObject[prop])) {
        return;
      }
      delete commandObject[prop];
    });
  }

  function createCommandRunners(sourceObjects, hookId) {
    var commandRunner, commandRunners = [];
    sourceObjects.forEach(function(sourceObject) {
      commandRunner = new CommandRunner(sourceObject, hookId);
      commandRunners.push(commandRunner);
    });
    return commandRunners;
  }

  function executeCommandRunners(commandRunners) {
    commandRunners.forEach(function(commandRunner) {
      commandRunner.execute();
    });
  }

  function flowAlias(commandObject, commandName, args) {
    return commandObject[commandName].apply(commandObject, args);
  }

  var FlowObject = {
    after: function(hookId) {
      this.hookId = hookId;
      return this;
    },
    on: function() {
      return flowAlias(this.flow(), 'on', arguments);
    },
    when: function() {
      return flowAlias(this.flow(), 'when', arguments);
    },
    whenGroup: function() {
      return flowAlias(this.flow(), 'whenGroup', arguments);
    },
    whenNot: function() {
      return flowAlias(this.flow(), 'whenNot', arguments);
    },
    watch: function() {
      return flowAlias(this.flow(), 'watch', arguments);
    },
    flow: function(hookId) {
      return this.instance(this, hookId);
    },
    model: function(sourceObject, hookId) {
      return this.instance(sourceObject, hookId, true);
    },
    instance: function(sourceObject, hookId, model) {
      var flowInstance = Obj.merge(CommandObject);
      flowInstance.commandRunner = new CommandRunner(null, hookId);
      
      Injector.process(sourceObject, function(_sourceObject) {
        sourceObject = (model) ? { '$': _sourceObject } : _sourceObject; 
        attachCommandFunctions(sourceObject, flowInstance);
        flowInstance.commandRunner.context = sourceObject;
        flowInstance.commandRunner.go();
      });
      
      return flowInstance;
    }
  };

  return FlowObject;
});
/**
 * Created by Shaun on 9/7/14.
 */

use(['Util', 'FlowObject', 'registerAll'], function(Util, FlowObject, registerAll) {
  'use strict';

  registerAll({
    Flow: function(sourceObject, hookId) {
      return FlowObject.instance(sourceObject, hookId);
    },
    'Flow.When': function(sourceObject, key, val) {
      return FlowObject.instance(sourceObject).when(key, val);
    },
    'Flow.Watch': function(sourceObject, key) {
      return FlowObject.instance(sourceObject).watch(key);
    },
    'Flow.On': function(sourceObject, eventName, func) {
      return FlowObject.instance(sourceObject).on(eventName, func);
    },
    'Flow.Model': function(sourceObject, hookId) {
      return FlowObject.model(sourceObject, hookId);
    }
  });
});
/**
 * Created by Shaun on 11/18/2014.
 */

kilo('Results', ['Util'], function(Util) {
  'use strict';

  return {
    add: function(sourceObjects, commandRunners) {
      this.sets = Util.def(this.sets, []);
      this.count = (Util.isDefined(this.count)) ? this.count + 1 : 0;
      this.sets.push({
        commandRunners: commandRunners,
        sourceObjects: sourceObjects,
        addCommand: function(command, index) {
          var commandRunners = this.commandRunners;
          if(Util.isDefined(index) && index < commandRunners.length) {
            commandRunners[index].add(command);
          } else {
            commandRunners.forEach(function(commandRunner) {
              commandRunner.add(command);
            });
          }
        }
      });
    },
    get: function(index) {
      return this.sets[index];
    },
    current: function() {
      return this.sets[this.count];
    },
    next: function() {
      return this.sets[this.count + 1];
    },
    last: function() {
      return this.sets[this.count - 1];
    }
  };
});

/**
 * Created by Shaun on 7/6/14.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind
 */
(function() {
  'use strict';
  if (!Function.prototype.bind) {
    Function.prototype.bind = function (oThis) {
      if (typeof this !== "function") {
        // closest thing possible to the ECMAScript 5
        // internal IsCallable function
        throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
      }

      var aArgs = Array.prototype.slice.call(arguments, 1),
        fToBind = this,
        fNOP = function () {},
        fBound = function () {
          return fToBind.apply(this instanceof fNOP && oThis ? this : oThis,
            aArgs.concat(Array.prototype.slice.call(arguments)));
        };

      fNOP.prototype = this.prototype;
      fBound.prototype = new fNOP();

      return fBound;
    };
  }
})();

