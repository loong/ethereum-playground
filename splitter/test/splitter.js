var Splitter = artifacts.require('./Splitter.sol');
var FixSplitter = artifacts.require('./FixSplitter.sol');

contract('Splitter', function (accounts) {
    var contract;

    var sender = accounts[0];
    var rec1 = accounts[1];
    var rec2 = accounts[2];
    
    beforeEach(function() {
	return Splitter.new()
	    .then(instance => {
		contract = instance;
	    });
    });

    it('should split', () => {
	return contract.split(sender, rec1, rec2, {from: sender, value: 500000})
	    .then(txn => {
		return contract.checkBalance(rec2);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '250000');
		return contract.checkBalance(rec1);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '250000');
		return contract.checkBalance(sender);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '0');
	    });
    });

    it('should split considering remainder', () => {
	return contract.split(sender, rec1, rec2, {from: sender, value: 5001})
	    .then(txn => {
		return contract.checkBalance(rec2);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '2500');
		return contract.checkBalance(rec1);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '2500');
		return contract.checkBalance(sender);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '1');
	    });
    });

    it('receiver should be able to withdraw', () => {
	let origBal;
	return contract.split(sender, rec1, rec2, {from: sender, value: web3.toWei(1, 'ether')})
	    .then(txn => {
		return web3.eth.getBalance(rec1);
	    })
	    .then(balance => {
		origBal = balance;
		return contract.withdraw(rec1, {from: rec1});
	    })
	    .then(txn => {
		return contract.checkBalance(rec1);
	    })
	    .then(balance => {
		assert.equal(balance, 0, 'Balance for rec1 should be 0 since withdrawn');
		return contract.checkBalance(rec2);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), web3.toWei(0.5, 'ether'), 'Balance for rec2 should be 250 since not withdrawn');
		return web3.eth.getBalance(rec1);
	    })
	    .then(balance => {
		assert.isAbove(balance.toNumber(), origBal.toNumber(), "rec1 should have received funds");
	    });
    });

    it('non receivers should not be able to withdraw', () => {
	return contract.split(sender, rec1, rec2, {from: sender, value: 500})
	    .then(txn => {
		return contract.withdraw(sender, {from: sender});
	    })
	    .then(assert.fail)
	    .catch(error => {
		assert(error.message.indexOf('invalid opcode') >= 0, 'should throw an error')
	    })
    });
});

contract('FixSplitter', function (accounts) {
    var contract;

    var sender = accounts[0];
    var rec1 = accounts[1];
    var rec2 = accounts[2];
    
    beforeEach(function() {
	return FixSplitter.new(rec1, rec2)
	    .then(instance => {
		contract = instance;
	    });
    });

    it('should split', () => {
	return contract.split({from: sender, value: 500000})
	    .then(txn => {
		return contract.checkBalance(rec2);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '250000');
		return contract.checkBalance(rec1);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '250000');
		return contract.checkBalance(sender);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '0');
	    });
    });

    it('receiver should be able to withdraw', () => {
	return contract.split({from: sender, value: 500})
	    .then(txn => {
		return contract.withdraw({from: rec1});
	    })
	    .then(txn => {
		return contract.checkBalance(rec1);
	    })
	    .then(balance => {
		assert.equal(balance, 0, 'Balance for rec1 should be 0 since withdrawn');
		return contract.checkBalance(rec2);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), '250', 'Balance for rec2 should be 250 since not withdrawn');
	    });
    });

});
