let Rental = artifacts.require("Rental");

// TODO
//  - test nonce / rentalIDs
//  - test if remainder is working
//  - test actual amount received on withdrawal

// Found here https://gist.github.com/xavierlepretre/88682e871f4ad07be4534ae560692ee6
web3.eth.getTransactionReceiptMined = function (txnHash, interval) {
  var transactionReceiptAsync;
  interval = interval ? interval : 500;
  transactionReceiptAsync = function(txnHash, resolve, reject) {
    try {
      var receipt = web3.eth.getTransactionReceipt(txnHash);
      if (receipt == null) {
        setTimeout(function () {
          transactionReceiptAsync(txnHash, resolve, reject);
        }, interval);
      } else {
        resolve(receipt);
      }
    } catch(e) {
      reject(e);
    }
  };

  return new Promise(function (resolve, reject) {
      transactionReceiptAsync(txnHash, resolve, reject);
  });
};

// Found here https://gist.github.com/xavierlepretre/afab5a6ca65e0c52eaf902b50b807401
var getEventsPromise = function (myFilter, count) {
  return new Promise(function (resolve, reject) {
    count = count ? count : 1;
    var results = [];
    myFilter.watch(function (error, result) {
      if (error) {
        reject(error);
      } else {
        count--;
        results.push(result);
      }
      if (count <= 0) {
        resolve(results);
        myFilter.stopWatching();
      }
    });
  });
};

// Found here https://gist.github.com/xavierlepretre/d5583222fde52ddfbc58b7cfa0d2d0a9
var expectedExceptionPromise = function (action, gasToUse) {
    return new Promise(function (resolve, reject) {
	try {
	    resolve(action());
	} catch(e) {
	    reject(e);
	}
    })
	.then(function (txn) {
	    return web3.eth.getTransactionReceiptMined(txn);
	})
        .then(function (receipt) {
	    // We are in Geth
	    assert.equal(receipt.gasUsed, gasToUse, "should have used all the gas");
	})
        .catch(function (e) {
	    let errMsg = e + "";
	    if (errMsg.indexOf("invalid JUMP") > -1 || errMsg.indexOf("invalid opcode") > -1) {
		// We are in TestRPC
	    } else {
		throw e;
	    }
	});
};

contract('Rental', (accounts) => {
    let landlord = accounts[0];
    let tenant = accounts[1];
    let arbitrar = accounts[2];
    let randomPerson = accounts[3]; // used to check whether anybody can pay the rent

    let deposit = web3.toWei(2, "ether");
    let insufficientDeposit = web3.toWei(1.9999999999, "ether");

    let rent = web3.toWei(0.000001, "ether");
    let rent5x = web3.toWei(0.000005, "ether");
    let tooMuchRent = web3.toWei(5, "ether");
    
    describe("Constructor Tests", () => {
	it('should not allow landlord to be arbitrar', () => {
	    return expectedExceptionPromise(() => {
		return Rental.new(deposit, rent, landlord, {from: landlord});
	    }, 1000000);
	});
    });
    
    describe("Test on vacant state", () => {
	let contract;

	beforeEach(() => {
	    return Rental.new(deposit, rent, arbitrar)
		.then(instance => {
		    contract = instance;
		});
	});

	it('should create vacant rental contract by default', () => {
	    return contract.isVacant.call().then(isVacant => {
		assert.isTrue(isVacant, "created rental contract is not set vacant");
	    });
	});

	it('only landlord should have access', () => {
	    return contract.hasAccess.call(landlord)
		.then(hasAccess => {
		    assert.isTrue(hasAccess, "landlord should have access");
		    return contract.hasAccess.call(tenant);
		})
		.then(hasAccess => {
		    assert.isFalse(hasAccess, "no one else should have access");
		});
	});

	it('should reject rental payments in vacant state', () => {
	    return expectedExceptionPromise(() => {
		return contract.payRent({from: tenant, value: rent});
	    }, 1000000);
	});

	it('should reject move out in vacant state', () => {
	    return expectedExceptionPromise(() => {
		return contract.moveOut({from: tenant});
	    }, 1000000);
	});

	it('should reject insufficient deposit', () => {
	    return expectedExceptionPromise(() => {
		return contract.moveIn({from: tenant, value: insufficientDeposit});
	    }, 1000000);
	});

	it('should move in and receive withdrawable rent', () => {
	    var initialBlockTime;
	    return contract.moveIn.call({from: tenant, value: deposit})
		.then(rentalID => {
		    assert.equal(rentalID.toString(10), "1", "valid tenant with enough deposit not able to move in");
		    return contract.moveIn({from: tenant, value: deposit});
		})
		.then(txn => {
		    return contract.isVacant.call();
		}).then(isVacant => {
		    assert.isFalse(isVacant, "cannot be vacant after tenant moved in");
		    return contract.paidRentUntilBlock.call();
		}).then(paidUntil => {
		    initialBlockTime = paidUntil.toNumber();
		    return contract.payRent.call({from: tenant, value: rent});
		}).then(success => {
		    assert.isTrue(success, "should be able to receive rent payment");
		    return contract.payRent({from: tenant, value: rent});
		}).then(txn => {
		    return contract.paidRentUntilBlock.call();
		}).then(paidUntil => {
		    assert.equal(paidUntil.toNumber(), initialBlockTime + 1, "should extend rental by 1 block");
		    return contract.withdrawRent({from: landlord});
		});
	});

    }); // End of test on vaccant state

    describe("Test on occupied state", () => {
	let contract;

	beforeEach(() => {
	    return Rental.new(deposit, rent, arbitrar)
		.then(instance => {
		    contract = instance;
		    return contract.moveIn({from: tenant, value: deposit})
		});
	});

	it('should be occupied', () => {
	    return contract.isVacant.call().then(isVacant => {
		assert.isFalse(isVacant, "cannot be vacant");
	    });
	});

	it('only tenant should have access', () => {
	    return contract.hasAccess.call(tenant)
		.then(hasAccess => {
		    assert.isTrue(hasAccess, "tenant should have access");
		    return contract.hasAccess.call(landlord);
		})
		.then(hasAccess => {
		    assert.isFalse(hasAccess, "landlord should not have access");
		});
	});

	it('should reject too much rent', () => {
	    return expectedExceptionPromise(() => {
		return contract.payRent({from: tenant, value: tooMuchRent});
	    });
	});

	it('anybody should be able to pay but only landlord should be able to withdraw', () => {
	    return contract.payRent.call({from: randomPerson, value: rent})
		.then(success => {
		    assert.isTrue(success, "anybody should be able to pay rent");
		    return contract.payRent({from: randomPerson, value: rent});
		}).then(txn => {
		    return expectedExceptionPromise(() => {
			return contract.withdrawRent({from: tenant});
		    }, 1000000);
		});
	});

	it('tenant should be able to move out', () => {
	    return contract.moveOut.call({from: tenant})
		.then(success => {
		    assert.isTrue(success, "tenant could not move out");
		    return contract.payRent({from: tenant, value: rent5x});
		})
		.then(txn => {
		    return contract.moveOut({from: tenant});
		})
	    	.then(txn => {
		    return contract.isVacant.call();
		})
		.then(isVacant => {
		    assert.isTrue(isVacant, "is not vacant after moving out");
		});
	});

	it('landlord should not be able to kick out tenant if rent is paid', () => {
	    let origPaidUntil;
	    return contract.paidRentUntilBlock.call()
		.then(paidUntil => {
		    origPaidUntil = paidUntil.toNumber();
		    return contract.payRent({from: tenant, value: rent5x});
		})
		.then(txn => {
		    return contract.paidRentUntilBlock.call();
		})
		.then(paidUntil => {
		    assert.equal(paidUntil.toNumber(), origPaidUntil+5, "PaidUntil should increase by 5 blocks");
		    return expectedExceptionPromise(() => {
			return contract.kickOut({from: landlord});
		    }, 1000000);
		});
	});

	it('landlord should be able to terminate contract', () => {
	    return contract.terminate.call()
		.then(success => {
		    assert.isTrue(success, "tenant could not move out");
		    return contract.terminate();
		})
	    	.then(txn => {
		    return contract.isVacant.call();
		})
		.then(isVacant => {
		    assert.isFalse(isVacant, "should still be vacant");

		    // tenant should no longer be able to pay rent
		    return expectedExceptionPromise(() => {
			return contract.payRent({from: tenant});
		    }, 1000000);
		});
	});


	it('landlord should be able to kick out tenant when pay is due', () => {
	    // transaction is only there to increment the blockcount
	    web3.eth.sendTransaction({from: randomPerson, to: landlord, value: web3.toWei(0.00001, "ether")});

	    return contract.kickOut.call({from: landlord})
		.then(success => {
		    assert.isTrue(success, "tenant could not be kicked out");
		    return contract.kickOut({from: landlord});
		})
	    	.then(txn => {
		    return contract.isVacant.call();
		})
		.then(isVacant => {
		    assert.isTrue(isVacant, "is not vacant after kicking out");
		});
	});
	
    }); // End of test on occupied state


    describe("Test on deposit withdrawal", () => {
    	let contract;

    	beforeEach(() => {
    	    return Rental.new(deposit, rent, arbitrar)
    		.then(instance => {
    		    contract = instance;
    		    return contract.moveIn({from: tenant, value: deposit});
    		});
    	});

	it('should be able to withdraw deposit', () => {
	    return contract.signDeposit(1, true, {from: landlord})
		.then(txn => {
		    return contract.signDeposit(1, true, {from: tenant});
		})
		.then(txn => {
		    return contract.withdrawDeposit(1, {from: tenant});
		});
	});

	it('should not be able to withdraw deposit with only one vote', () => {
	    return contract.signDeposit(1, true, {from: landlord})
		.then(txn => {
		    return expectedExceptionPromise(() => {
			return contract.withdrawDeposit(1, {from: tenant});
		    }, 1000000);
		});
	});


	it('should not allow random people to vote', () => {
	    return expectedExceptionPromise(() => {
		return contract.signDeposit(1, true, {from: randomPerson})
	    }, 1000000); 
	});

	it('should be able to resolve withdrawal with arbitrar', () => {
	    return contract.signDeposit(1, true, {from: tenant})
		.then(txn => {
		    return contract.signDeposit(1, true, {from: arbitrar});
		})
		.then(txn => {
		    return contract.withdrawDeposit(1, {from: tenant});
		});
	});


    }); // End of deposit withdrawal tests
});
