let Owned = artifacts.require("Owned");

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

contract("Owned", accounts => {
    let contract;
    let owner = accounts[0];
    let notOwner = accounts[1];

    beforeEach(() => {
	return Owned.new({from: owner})
	    .then(instance => {
		contract = instance;
	    });
    });

    it("should set owner correctly", () => {
	return contract.owner.call()
	    .then(currentOwner => {
		assert.equal(currentOwner, owner, "owner should be set correctly");
	    });
    });

    it("should be able to set new owner", () => {
	return contract.verifyNewOwner({from: notOwner})
	    .then(txn => {
		return contract.changeOwner(notOwner, {from: owner});
	    })
	    .then(txn => {
		return contract.owner.call();
	    })
	    .then(newOwner => {
		assert.equal(newOwner, notOwner, "should have new owner now");
	    });
    });

    it("should not be able to set new owner if not owner", () => {
	return expectedExceptionPromise(() => {
	    return contract.changeOwner(notOwner, {from: notOwner});
	});
    });

    it("should not set owner to an unverified account", () => {
	return expectedExceptionPromise(() => {
	    return contract.changeOwner(notOwner, {from: owner});
	});
    });

});
