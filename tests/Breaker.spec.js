'use strict';

const Breaker = require('../breaker/Breaker');
const expect = require('chai').expect;
const EventEmitter = require('events').EventEmitter;
const sinon = require('sinon');

let breaker = null;

describe('Breaker Class', () => {
  it('Should be an instance of EventEmitter', () => {
    breaker = new Breaker('breakerGroup', 'breakerName', {
      callFunc: () => {
      },
      fallbackFunc: () => {
      }
    });
    expect(breaker).to.be.instanceof(EventEmitter);
  });
  // setup tests


  // happy tests
  it('Should resolve a well-behaving promise', () => {
    breaker = new Breaker('breakerGroup', 'breakerName', {
      callFunc: (testArg) => {
        expect(testArg).to.equal('TeSt');
        return Promise.resolve(testArg)
      },
      fallbackFunc: () => {
        throw new Error('Should not be called');
      }
    });
    return breaker.exec('TeSt').then((result) => {
      console.log('result:', result);
      expect(result).to.equal('TeSt');
    });
  });

  // unhappy tests
  it('Should always fallback when no cache', () => {
    breaker = new Breaker('breakerGroup', 'breakerName', {
      callFunc: (testArg) => {
        expect(testArg).to.equal('TeSt');
        return Promise.reject(new Error('whatever'));
      },
      fallbackFunc: (testArg) => {
        expect(testArg).to.equal('TeSt');
        return Promise.resolve('FallBacK');
      }
    });
    return breaker.exec('TeSt').then((result) => {
      console.log('result:', result);
      expect(result).to.equal('FallBacK');
    });
  });

  it('Should pass-through functional errors', () => {
    const testError = new Error(404);
    breaker = new Breaker('breakerGroup', 'breakerName', {
      callFunc: (testArg) => {
        expect(testArg).to.equal('TeSt');
        return Promise.reject(testError);
      },
      fallbackFunc: (testArg) => {
        throw new Error('Should not be called');
      }
    });
    return breaker.exec('TeSt').then((result) => {
      throw Error('Should not be called');
    }).catch(err => {
      expect(err).to.equal(testError);
    });
  });

  it('Should use cache when enabled', () => {
    let callDone = 'OK-TO-CALL';
    breaker = new Breaker('breakerGroup', 'breakerName', {
      callFunc: (testArg) => {
        const response = 'REAL:' + testArg + '-' + callDone;
        callDone = 'ALREADY-CALLED';
        return Promise.resolve(response);
      },
      useCache: true
    });

    // do it once
    return breaker.exec('TeSt')
      .then(result1 => {
        expect(result1).to.equal('REAL:TeSt-OK-TO-CALL');
        // now do it again
        return breaker.exec('TeSt');
      })
      .then(result2 => {
        expect(result2).to.equal('REAL:TeSt-OK-TO-CALL');
      });
  });

  it('Should not use cache when disabled', () => {
    let callDone = 'CALLED-ONCE';
    breaker = new Breaker('breakerGroup', 'breakerName', {
      callFunc: (testArg) => {
        const response = 'REAL:' + testArg + '-' + callDone;
        callDone = 'CALLED-MORE';
        return Promise.resolve(response);
      },
      useCache: false
    });

    // do it once
    return breaker.exec('TeSt')
      .then(result1 => {
        console.log('result1:', result1);
        expect(result1).to.equal('REAL:TeSt-CALLED-ONCE');
        // now do it again
        return breaker.exec('TeSt');
      })
      .then(result2 => {
        console.log('result2:', result2);
        expect(result2).to.equal('REAL:TeSt-CALLED-MORE');
      });
  });

  it('Should use cache on fallback when cache enabled and value found', () => {
    let callDone = false;
    breaker = new Breaker('breakerGroup', 'breakerName', {
      callFunc: (testArg) => {
        if (callDone) {
          throw new Error('TESTFAIL');
        }
        callDone = true;
        return Promise.resolve("FIRST");
      },
      useCache: true
    });

    // do it once to fill cache
    return breaker.exec('TeSt')
      .then(result1 => {
        expect(result1).to.equal('FIRST');
        // now do it again, call fails and result should be from cache
        return breaker.exec('TeSt');
      })
      .then(result2 => {
        expect(result2).to.equal('FIRST');
      });
  });

  it('Should use cache on fallback but not on good calls when noCacheOnGood is true', () => {
    let callsDone = 0;
    breaker = new Breaker('breakerGroup', 'breakerName', {
      callFunc: (testArg) => {
        callsDone++;
        if (callsDone === 3) {
          throw new Error('TESTFAIL');
        }
        return Promise.resolve("CALL-"+callsDone);
      },
      useCache: true,
      noCacheOnGood: true,
    });

    // do it once to fill cache
    return breaker.exec('TeSt')
      .then(result1 => {
        expect(result1).to.equal('CALL-1');
        // now do it again, call fails and result should be from cache
        return breaker.exec('TeSt');
      })
      .then(result2 => {
        expect(result2).to.equal('CALL-2');
        // now do it again, call still ok and result should not be from cache
        return breaker.exec('TeSt');
      })
      .then(result3 => {
        expect(result3).to.equal('CALL-2');
      });
  });

})
;
