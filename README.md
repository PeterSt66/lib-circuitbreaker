
lib-circuitbreaker
==================

A caching circuit breaker for nodejs based on an adaption of Brakes (https://github.com/awolden/brakes). 

**Requires Node 4.2.0 or higher but shines with 6.x **
** Expects a Sails 0.12.0 or higher environment **

## Examples

## Methods
Method | Argument(s) | Returns | Description
---|---|---|---
*static* getGlobalStats|globalStats|N/A|Returns a reference to the global stats tracker from Brakes
exec|(args to be passed to callFunc)|resolve from call or fallback|executes the breaker functionality

## Events
(no Brakes events are exposed at the moment)

## How to use

```javascript
    const breakerGroup = '(breaker group)'; 
    const breakerName = 'name of breaker, part of default caching key and used in Hystrix stream';
    const Options {} // see below    
    const Breaker = require('lib-circuitbreaker'); 
    breaker = new Breaker(breakerGroup, breakerName, options);
    // 
```


Option field|Description
---|---|---|---
callFunc       | A function returning a Promise in which a potentially unreliably service is called, arguments are equal to the arguments of the exec() call
fallbackFunc   | A function returning a Promise which gives a fallback response for the given parameters, will only be called if no cache result is present
cacheKeyFunc   | A function returning a cache-index key based on the given parameters
brakesOptions  | Options to forwared to the Brakes object
noCacheOnGood  | Boolean, if thruthy results will not be returned from the cache if the circuit is closed, only stored in it.
useCache       | Boolean, use the cache if thruthy.

## Example
``` javascript
const findBreaker = new Breaker(breakerGroup, 'find', {
    callFunc: function(...execParams) {
        // some code returning a Promise in which a potentially unreliably service is called 
    },
    fallbackFunc: function(...execParams) {
        // some code returning a Promise which gives a fallback response for the given parameters
         // will only be called if no cache result is present
    },
    noCacheOnGood: true,
    useCache: true
});

module.exports.find = function(params) {
    return findBreaker.exec(params);
};
```
     


**Global Stats Stream**

The following directly from Brakes documentation, available via Breaker.getGlobalStats() stream:
 
Brakes automatically tracks all created instances of brakes and provides a global stats stream for easy consumption and reporting on all brakes instances. These streams will aggregate all stat events into one single stream.

```javascript
const globalStats = Brakes.getGlobalStats();

globalStats.getRawStream().on('data', (stats) =>{
  console.log('received global stats ->', stats);
});
```

## Hystrix Dashboard

Using the global stats stream with a special transform, brakes makes it incredibly easy to generate a SSE stream that is compliant with the hystrix dashboard and turbine.

**Example:**
```javascript
const globalStats = Brakes.getGlobalStats();

/*
Create SSE Hystrix compliant Server
*/
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/event-stream;charset=UTF-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  globalStats.getHystrixStream().pipe(res);
}).listen(8081, () => {
  console.log('---------------------');
  console.log('Hystrix Stream now live at localhost:8081/hystrix.stream');
  console.log('---------------------');
});
```

To aid in testing it might be useful to have a local instance of the hystrix dashboard running:

`docker run -d -p 8080:8080 --name hystrix-dashboard mlabouardy/hystrix-dashboard:latest`


Additional Reading: [Hystrix Metrics Event Stream](https://github.com/Netflix/Hystrix/tree/master/hystrix-contrib/hystrix-metrics-event-stream), [Turbine](https://github.com/Netflix/Turbine/wiki), [Hystrix Dashboard](https://github.com/Netflix/Hystrix/wiki/Dashboard)

---
