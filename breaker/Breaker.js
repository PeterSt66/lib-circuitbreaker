'use strict';

const Brakes = require('brakes');
const LRU = require("lru-cache");

const defBrakesOptions = {
    timeout: 10 * 1000,
    circuitDuration: 15 * 1000
};

class Breaker {

    static getGlobalStats() {
        return Brakes.getGlobalStats();
    }

    getOriginalCallFunc() {
        return this._originalCallFunc;
    }

    withCaching(breaker) {
        return function(...args) {
            const key = breaker._cachekeyFunc(...args);
            sails.log.silly('Breaker::callCached start callService with caching, key:', key);
            if (!breaker._options.noCacheOnGood && breaker.cache.has(key)) {
                sails.log.silly('Breaker::callCached Resolving from cache for key:', key);
                return Promise.resolve(breaker.cache.get(key));
            }

            return breaker._originalCallFunc(...args)
                .then(function(found) {
                    sails.log.silly('Breaker::callCached Adding to cache for key:', key);
                    breaker.cache.set(key, found);
                    return Promise.resolve(found);
                })
                .catch(function(err) {
                    sails.log.silly('Breaker::callCached Error on original call:', err.message ? err.message : err);
                    throw err;
                });
        };
    }

    withFallbackCaching(breaker) {
        return function(...args) {
            const key = breaker._cachekeyFunc(...args);
            sails.log.silly('Breaker::fallback start fallbackFunc with caching, key:', key);
            if (breaker.cache.has(key)) {
                sails.log.silly('Breaker::fallback Resolving from cache for key:', key);
                return Promise.resolve(breaker.cache.peek(key)); // use a peek to not reset lastused
            }
            return breaker._originalFallbackFunc(...args);
        };
    }

    createCache() {
        return LRU({
            max: 5000,
            length: function(n, key) {
                return n * 2 + key.length
            },
            dispose: function(key, value) {
                sails.log.silly('Breaker::cache Cache dispose:', key);
            },
            maxAge: 1000 * 60 * 60 // 60 secs * 60 mins = 1 hour
        });
    }

    static generateCacheKey(...args) {
        return JSON.stringify(args);
    }

    constructor(breakerGroup, breakerName, options) {
        let callFunc = options.callFunc;
        let fallbackFunc = options.fallbackFunc;
        let cacheKeyFunc = options.cachekeyFunc;
        let brakesOptions = options.brakesOptions || defBrakesOptions;
        this._originalCallFunc = callFunc;
        this._originalFallbackFunc = fallbackFunc;
        this._cachekeyFunc = cacheKeyFunc;
        if (options.useCache && !cacheKeyFunc) {
            this._cachekeyFunc = function() {
                return util.generateCacheKey(breakerGroup+'::'+breakerName, arguments);
            }
        }
        this._options = options;
        sails.log.info('Breaker::setup start for', breakerGroup, '.', breakerName);
        brakesOptions.group = breakerGroup;
        brakesOptions.name = breakerGroup + ":" + breakerName;

        if (cacheKeyFunc) {
            sails.log.info('Breaker::setup Enabling caching');
            callFunc = this.withCaching(this);
            this.cache = this.createCache();
        }
        this.brakes = new Brakes(callFunc, brakesOptions);

        if (cacheKeyFunc) {
            sails.log.info('Breaker::setup Enabling fallback caching');
            fallbackFunc = this.withFallbackCaching(this);
        }
        this.brakes.fallback(fallbackFunc);

        if (!options.isApplicationError) {
            options.isApplicationError = function(err) {
                sails.log.silly('Breaker::isApplicationError check for',err);
                // default check for 404 (not found) and 406 (validation failed)
                return err == 404 || err == 406;
            }
        }
        this.brakes.checkIfErrorIsApplication(options.isApplicationError);
        this.brakes.on('failure', (d, err) => {
            sails.log.verbose('Breaker::exec failure: ', d, err ? err.message : "NoErrMsg");
        });
        this.brakes.on('timeout', (d) => {
            sails.log.verbose('Breaker::exec timeout: ', d);
        });
        this.brakes.on('circuitOpen', () => {
            sails.log.info('Breaker::exec circuitOpen', brakesOptions.group, brakesOptions.name);
        });
        this.brakes.on('circuitClosed', () => {
            sails.log.info('Breaker::exec circuitClosed', brakesOptions.group, brakesOptions.name);
        });
    }

    exec() {
        //console.log('exec(..)', ...arguments);
        return this.brakes.exec(...arguments);
    }
}

module.exports = Breaker;
