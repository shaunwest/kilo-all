/**
 * Created by Shaun on 5/1/14.
 *
 */

(function(id) {
  'use strict';

  var core, Util, Injector, types, gids = {}, allElements, previousOwner = undefined;
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

  function getInterceptor(interceptors, matchString) {
    var i, interceptor, matches;
    for(i = 0; i < interceptors.length; i++) {
      interceptor = interceptors[i];
      if(matches = matchString.match(interceptor.pattern)) {
        return {key: matches[1], cb: interceptor.cb};
      }
    }
    return null;
  }

  function intercept(module, interceptorFunc) {
    if(interceptorFunc) {
      return interceptorFunc(module);
    }
    return module;
  }

  Injector = {
    unresolved: {},
    modules: {},
    interceptors: [],
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
      var modules, module, interceptor, interceptorFunc;

      interceptor = getInterceptor(this.interceptors, key);
      if(interceptor) {
        interceptorFunc = interceptor.cb;
        key = interceptor.key;
      }
      modules = this.modules;
      module = modules[key];

      if(module) {
        module = intercept(module, interceptorFunc);
        cb(module);
        return;
      }

      if(key.indexOf('/') != -1) {
        this.modules.httpGet(key, cb);
        return;
      }

      module = this.unresolved[key];
      if(!module) {
        getElement(key, null, function(element) {
          if(element) {
            element = intercept(element, interceptorFunc);
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
        module = intercept(module, interceptorFunc);
        cb(module);
      });

      return;
    },
    resolve: function(deps, cb, index, results) {
      var that = this; // FIXME

      index = Util.def(index, 0);

      var depName = deps[index];
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
    addInterceptor: function(pattern, cb) {
      this.interceptors.push({pattern: pattern, cb: cb});
    },
    process: function(deps, cb) { // Can this go somewhere else?
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
    .setModule('httpGet', httpGet);

  /** create references to core */
  if(typeof window !== 'undefined') {
    if(window[id]) {
      Util.warn('a preexisting value at namespace \'' + id + '\' has been overwritten.');
      previousOwner = window[id];
    }
    window[id] = core;
    if(!window.register) window.register = core.register;
    if(!window.use) window.use = core.use;
  }

  if(typeof exports !== 'undefined') {
    exports[id] = core; 
    exports['register'] = core.register;
    exports['use'] = core.use;   
  }

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
 * Created by Shaun on 5/3/14.
 */

if(CommonJS) {
  kilo.register('Http', ['Util'], function(Util) {
    function parseResponse(contentType, responseText) {
      switch(contentType) {
        case 'application/json':
        case 'application/json; charset=utf-8':
          return JSON.parse(responseText);
        default:
          return responseText;
      }
    }

    function get(url, contentTypeOrOnProgress, onProgress) {
      var promise = new Promise(function(resolve, reject) {
        var req = http.request(url, function(res) {
          var data = '';

          if(Util.isFunction(contentTypeOrOnProgress)) {
            onProgress = contentTypeOrOnProgress;
            contentTypeOrOnProgress = null;
          }

          res.setEncoding('utf8');

          res.on('data', function (chunk) {
            data += chunk;
            if(onProgress) {
              onProgress(chunk.length, data.length);
            }
          });

          res.on('end', function() {
            var contentType = res.headers['content-type'];
            switch(res.statusCode) {
              case 500:
                reject({statusText: '', status: res.statusCode});
                break;
              case 404:
                reject({statusText: '', status: res.statusCode});
                break;
              case 304:
                resolve({data: parseResponse(contentType, data), status: res.statusCode});
                break;
              default:
                resolve({data: parseResponse(contentType, data), status: res.statusCode});
            }
          });
        });

        req.on('error', function(e) {
          console.log('problem with request: ' + e.message);
          console.log('URL: ' + url);
          reject('Network error.');
        });

        req.end();
      });

      return promise;
    }

    return {
      get: get
    };
  });
} else {
  register('Http', ['Util'], function(Util) {
    'use strict';

    function parseResponse(contentType, responseText) {
      switch(contentType) {
        case 'application/json':
        case 'application/json; charset=utf-8':
          return JSON.parse(responseText);
        default:
          return responseText;
      }
    }

    function get(url, contentTypeOrOnProgress, onProgress) {
      return new Promise(function(resolve, reject) {
        var req = new XMLHttpRequest();

        if(Util.isFunction(contentTypeOrOnProgress)) {
          onProgress = contentTypeOrOnProgress;
          contentTypeOrOnProgress = null;
        }

        if(onProgress) {
          req.addEventListener('progress', function(event) {
            onProgress(event.loaded, event.total);
          }, false);
        }

        req.onerror = function(event) {
          reject(Util.error('Network error.'));
        };

        req.onload = function() {
          var contentType = contentTypeOrOnProgress || this.getResponseHeader('content-type');

          switch(this.status) {
            case 500:
              reject({statusText: this.statusText, status: this.status});
              break;
            case 404:
              reject({statusText: this.statusText, status: this.status});
              break;
            case 304:
              resolve({data: parseResponse(contentType, this.responseText), status: this.status});
              break;
            default:
              resolve({data: parseResponse(contentType, this.responseText), status: this.status});
          }
        };

        req.open('get', url, true);
        req.send();
      });
    }

    return {
      get: get
    };
  });
}


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
// Production steps of ECMA-262, Edition 5, 15.4.4.19
// Reference: http://es5.github.io/#x15.4.4.19
if (!Array.prototype.map) {

  Array.prototype.map = function(callback, thisArg) {

    var T, A, k;

    if (this == null) {
      throw new TypeError(' this is null or not defined');
    }

    // 1. Let O be the result of calling ToObject passing the |this| 
    //    value as the argument.
    var O = Object(this);

    // 2. Let lenValue be the result of calling the Get internal 
    //    method of O with the argument "length".
    // 3. Let len be ToUint32(lenValue).
    var len = O.length >>> 0;

    // 4. If IsCallable(callback) is false, throw a TypeError exception.
    // See: http://es5.github.com/#x9.11
    if (typeof callback !== 'function') {
      throw new TypeError(callback + ' is not a function');
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    if (arguments.length > 1) {
      T = thisArg;
    }

    // 6. Let A be a new array created as if by the expression new Array(len) 
    //    where Array is the standard built-in constructor with that name and 
    //    len is the value of len.
    A = new Array(len);

    // 7. Let k be 0
    k = 0;

    // 8. Repeat, while k < len
    while (k < len) {

      var kValue, mappedValue;

      // a. Let Pk be ToString(k).
      //   This is implicit for LHS operands of the in operator
      // b. Let kPresent be the result of calling the HasProperty internal 
      //    method of O with argument Pk.
      //   This step can be combined with c
      // c. If kPresent is true, then
      if (k in O) {

        // i. Let kValue be the result of calling the Get internal 
        //    method of O with argument Pk.
        kValue = O[k];

        // ii. Let mappedValue be the result of calling the Call internal 
        //     method of callback with T as the this value and argument 
        //     list containing kValue, k, and O.
        mappedValue = callback.call(T, kValue, k, O);

        // iii. Call the DefineOwnProperty internal method of A with arguments
        // Pk, Property Descriptor
        // { Value: mappedValue,
        //   Writable: true,
        //   Enumerable: true,
        //   Configurable: true },
        // and false.

        // In browsers that support Object.defineProperty, use the following:
        // Object.defineProperty(A, k, {
        //   value: mappedValue,
        //   writable: true,
        //   enumerable: true,
        //   configurable: true
        // });

        // For best browser support, use the following:
        A[k] = mappedValue;
      }
      // d. Increase k by 1.
      k++;
    }

    // 9. return A
    return A;
  };
}
(function() {
    var root;

  if (typeof window === 'object' && window) {
    root = window;
  } else {
    root = global;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.Promise ? root.Promise : Promise;
  } else if (!root.Promise) {
    root.Promise = Promise;
  }

  // Use polyfill for setImmediate for performance gains
  var asap = root.setImmediate || function(fn) { setTimeout(fn, 1); };

  // Polyfill for Function.prototype.bind
  function bind(fn, thisArg) {
    return function() {
      fn.apply(thisArg, arguments);
    }
  }

  var isArray = Array.isArray || function(value) { return Object.prototype.toString.call(value) === "[object Array]" };

  function Promise(fn) {
    if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new');
    if (typeof fn !== 'function') throw new TypeError('not a function');
    this._state = null;
    this._value = null;
    this._deferreds = []

    doResolve(fn, bind(resolve, this), bind(reject, this))
  }

  function handle(deferred) {
    var me = this;
    if (this._state === null) {
      this._deferreds.push(deferred);
      return
    }
    asap(function() {
      var cb = me._state ? deferred.onFulfilled : deferred.onRejected
      if (cb === null) {
        (me._state ? deferred.resolve : deferred.reject)(me._value);
        return;
      }
      var ret;
      try {
        ret = cb(me._value);
      }
      catch (e) {
        deferred.reject(e);
        return;
      }
      deferred.resolve(ret);
    })
  }

  function resolve(newValue) {
    try { //Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
      if (newValue === this) throw new TypeError('A promise cannot be resolved with itself.');
      if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
        var then = newValue.then;
        if (typeof then === 'function') {
          doResolve(bind(then, newValue), bind(resolve, this), bind(reject, this));
          return;
        }
      }
      this._state = true;
      this._value = newValue;
      finale.call(this);
    } catch (e) { reject.call(this, e); }
  }

  function reject(newValue) {
    this._state = false;
    this._value = newValue;
    finale.call(this);
  }

  function finale() {
    for (var i = 0, len = this._deferreds.length; i < len; i++) {
      handle.call(this, this._deferreds[i]);
    }
    this._deferreds = null;
  }

  function Handler(onFulfilled, onRejected, resolve, reject){
    this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
    this.onRejected = typeof onRejected === 'function' ? onRejected : null;
    this.resolve = resolve;
    this.reject = reject;
  }

  /**
   * Take a potentially misbehaving resolver function and make sure
   * onFulfilled and onRejected are only called once.
   *
   * Makes no guarantees about asynchrony.
   */
  function doResolve(fn, onFulfilled, onRejected) {
    var done = false;
    try {
      fn(function (value) {
        if (done) return;
        done = true;
        onFulfilled(value);
      }, function (reason) {
        if (done) return;
        done = true;
        onRejected(reason);
      })
    } catch (ex) {
      if (done) return;
      done = true;
      onRejected(ex);
    }
  }

  Promise.prototype['catch'] = function (onRejected) {
    return this.then(null, onRejected);
  };

  Promise.prototype.then = function(onFulfilled, onRejected) {
    var me = this;
    return new Promise(function(resolve, reject) {
      handle.call(me, new Handler(onFulfilled, onRejected, resolve, reject));
    })
  };

  Promise.all = function () {
    var args = Array.prototype.slice.call(arguments.length === 1 && isArray(arguments[0]) ? arguments[0] : arguments);

    return new Promise(function (resolve, reject) {
      if (args.length === 0) return resolve([]);
      var remaining = args.length;
      function res(i, val) {
        try {
          if (val && (typeof val === 'object' || typeof val === 'function')) {
            var then = val.then;
            if (typeof then === 'function') {
              then.call(val, function (val) { res(i, val) }, reject);
              return;
            }
          }
          args[i] = val;
          if (--remaining === 0) {
            resolve(args);
          }
        } catch (ex) {
          reject(ex);
        }
      }
      for (var i = 0; i < args.length; i++) {
        res(i, args[i]);
      }
    });
  };

  Promise.resolve = function (value) {
    if (value && typeof value === 'object' && value.constructor === Promise) {
      return value;
    }

    return new Promise(function (resolve) {
      resolve(value);
    });
  };

  Promise.reject = function (value) {
    return new Promise(function (resolve, reject) {
      reject(value);
    });
  };

  Promise.race = function (values) {
    return new Promise(function (resolve, reject) {
      for(var i = 0, len = values.length; i < len; i++) {
        values[i].then(resolve, reject);
      }
    });
  };
})();
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

