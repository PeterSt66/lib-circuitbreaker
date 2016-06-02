'use strict';

const Brakes = require('brakes');
const lruCache = require('lru-cache');
const EventEmitter = require('events').EventEmitter;

const defaultLogger = {
  silly: (...args) => {
    console.log('silly:', ...args);
  },
  verbose: (...args) => {
    console.log('verbose:', ...args);
  },
  info: (...args) => {
    console.log('info:', ...args);
  },
  warn: (...args) => {
    console.log('warn:', ...args);
  }
};

const defBrakesOptions = {
  timeout: 10 * 1000,
  circuitDuration: 15 * 1000
};

class Breaker extends EventEmitter {
  static getGlobalStats() {
    return Brakes.getGlobalStats();
  }

  getOriginalCallFunc() {
    return this._originalCallFunc;
  }

  withCaching(breaker) {
    return function callWithCaching(...args) {
      const key = breaker._cachekeyFunc(...args);
      breaker.logger.silly('Breaker::callCached start callService with caching, key:', key);
      if (!breaker._options.noCacheOnGood && breaker.cache.has(key)) {
        breaker.logger.silly('Breaker::callCached Resolving from cache for key:', key);
        return Promise.resolve(breaker.cache.get(key));
      }

      return breaker._originalCallFunc(...args)
        .then(function onGoodResult(found) {
          breaker.logger.silly('Breaker::callCached Adding to cache for key:', key);
          breaker.cache.set(key, found);
          return Promise.resolve(found);
        })
        .catch(function onBadResult(err) {
          breaker.logger.silly('Breaker::callCached Error on original call:', err.message ? err.message : err);
          throw err;
        });
    };
  }

  withFallbackCaching(breaker) {
    return function fallbackWithCaching(...args) {
      const key = breaker._cachekeyFunc(...args);
      breaker.logger.silly('Breaker::fallback start fallbackFunc with caching, key:', key);
      if (breaker.cache.has(key)) {
        breaker.logger.silly('Breaker::fallback Resolving from cache for key:', key);
        return Promise.resolve(breaker.cache.peek(key)); // use a peek to not reset lastused
      }
      return breaker._originalFallbackFunc(...args);
    };
  }

  createCache(breaker, options) {
    return lruCache({
      max: options.cacheMaxEntries || 5000,
      length: function calcLength(n, key) {
        return n * 2 + key.length;
      },
      dispose: function cacheDispose(key) {
        breaker.logger.silly('Breaker::cache Cache dispose:', key);
      },
      maxAge: options.cacheMaxAge || 1000 * 60 * 60 // 60 secs * 60 mins = 1 hour
    });
  }

  static generateCacheKey(...args) {
    return JSON.stringify(args);
  }

  constructor(breakerGroup, breakerName, breakerOptions) {
    super();
    defaultLogger.info('Breaker::construct start', breakerGroup, breakerName, breakerOptions);
    const self = this;
    const options = breakerOptions || {};
    this._options = options;

    this.logger = options.logger
    if (!this.logger) {
      this.logger = (global.sails && global.sails.log) ? global.sails.log : defaultLogger;
    }

    const brakesOptions = options.brakesOptions || defBrakesOptions;

    this.breakerFullname = `${breakerGroup}::${breakerName}`;
    this.logger.info('Breaker::setup start for ', this.breakerFullname);
    brakesOptions.group = breakerGroup;
    brakesOptions.name = breakerGroup + ':' + breakerName;

    let callFunc = options.callFunc;
    this._originalCallFunc = callFunc;
    let fallbackFunc = options.fallbackFunc;
    if (!fallbackFunc) {
      fallbackFunc = () => {
        throw new Error('No fallback function defined');
      };
    }
    this._originalFallbackFunc = fallbackFunc;


    let cacheKeyFunc = options.cachekeyFunc;
    if (options.useCache && !cacheKeyFunc) {
      this.logger.info('Breaker::setup enabling cache with default cachekey generation');
      cacheKeyFunc = function defaultCacheKeyFunc() {
        return Breaker.generateCacheKey(self.breakerFullname, arguments);
      };
    }
    this._cachekeyFunc = cacheKeyFunc;

    if (cacheKeyFunc) {
      this.logger.info('Breaker::setup Enabling caching');
      callFunc = this.withCaching(this);
      this.cache = this.createCache(this, options);
    }

    this.brakes = new Brakes(callFunc, brakesOptions);

    if (cacheKeyFunc) {
      this.logger.info('Breaker::setup Enabling fallback caching');
      fallbackFunc = this.withFallbackCaching(this);
    }
    this.brakes.fallback(fallbackFunc);

    let isApplicationError = options.isApplicationError;
    if (!isApplicationError) {
      isApplicationError = this.defaultIsApplicationError(this);
    }
    this.brakes.checkIfErrorIsApplication(isApplicationError);

    this.brakes.on('failure', (d, err) => {
      this.logger.verbose('Breaker::exec failure: ', d, err ? err.message : 'NoErrMsg');
    });
    this.brakes.on('timeout', (d) => {
      this.logger.verbose('Breaker::exec timeout: ', d);
    });
    this.brakes.on('circuitOpen', () => {
      this.logger.info('Breaker::exec circuitOpen', brakesOptions.group, brakesOptions.name);
    });
    this.brakes.on('circuitClosed', () => {
      this.logger.info('Breaker::exec circuitClosed', brakesOptions.group, brakesOptions.name);
    });
  }

  exec() {
    this.logger.silly('exec(..)', ...arguments);
    return this.brakes.exec(...arguments);
  }

  checkIsApplicationError(err) {
    // default check for 404 (not found) and 406 (validation failed)
    if (err) {
      if (err === 404 || err === 406) {
        return true;
      }
      if (err.statusCode && ('' + err.statusCode === '404') || ('' + err.statusCode === '406')) {
        return true;
      }
      if (err.message && ('' + err.message === '404') || ('' + err.message === '406')) {
        return true;
      }
    }
    return false;
  }


  defaultIsApplicationError(breaker) {
    return function defaultIsApplicationError(err) {
      breaker.logger.silly('Breaker::isApplicationError check for:', err);
      const decision = breaker.checkIsApplicationError(err);
      breaker.logger.silly('Breaker::isApplicationError:', decision, ' check was for:', err);
      return decision;
    }
  }
}

module.exports = Breaker;
