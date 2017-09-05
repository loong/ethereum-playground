let Remittance = artifacts.require("Remittance")
let Deposit = artifacts.require("Deposit")

contract('Remittance', (accounts) => {
    let remitContract;
    let deposContract1;
    let deposContract2;

    let sender = accounts[0];
    let recipient = accounts[1];

    let amount1 = web3.toWei(1, "ether");
    let amount2 = web3.toWei(2, "ether");
    let origBalance;
    
    beforeEach(() => {
	return Remittance.new()
	    .then(instance => {
		remitContract = instance;
	    });
    });

    it('should deposit', () => {
	return remitContract.deposit(recipient, "password", 1000, {from: sender, value: amount1})
	    .then(txn => {
		return web3.eth.getBalance(recipient);
	    })
	    .then(balance => {
		origBalance = balance;
		return remitContract.getDeposits(recipient, "password");
	    })
	    .then(addr => {
		assert.lengthOf(addr, 1, "There should only be one deposit");
		deposContract1 = Deposit.at(addr[0]);

		return web3.eth.getBalance(addr[0]);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), amount1);
		
		return deposContract1.withdraw("password", {from: recipient});
	    })
	    .then(txn => {
		return web3.eth.getBalance(deposContract1.address);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), "0");

		return web3.eth.getBalance(recipient);
	    })
	    .then(balance => {
		assert.isAbove(balance.toNumber(), origBalance.toNumber(), "Recipient was not credited");
	    });
    });

    it('should refund', () => {
	return remitContract.deposit(recipient, "password", 1, {from: sender, value: amount1})
	    .then(txn => {
		return web3.eth.getBalance(sender);
	    })
	    .then(balance => {
		origBalance = balance;
		return remitContract.getDeposits(recipient, "password");
	    })
	    .then(addr => {
		assert.lengthOf(addr, 1, "There should only be one deposit");
		deposContract1 = Deposit.at(addr[0]);

		return deposContract1.refund({from: sender});
	    })
	    .then(txn => {
		return web3.eth.getBalance(sender);
	    })
	    .then(balance => {
		assert.isAbove(balance.toNumber(), origBalance.toNumber(), "Sender was not credited with refund");
	    });
    });

    
    it('should not refund before deadline', () => {
	return remitContract.deposit(recipient, "password", 1000, {from: sender, value: amount1})
	    .then(txn => {
		return remitContract.getDeposits(recipient, "password");
	    })
	    .then(addr => {
		assert.lengthOf(addr, 1, "There should only be one deposit");
		deposContract1 = Deposit.at(addr[0]);

		return deposContract1.refund({from: sender});
	    })
	    .then(assert.fail)
	    .catch(error => {
		assert(error.message.indexOf('invalid opcode') >= 0, 'should throw an error')
	    });
    });

    it('should be able to handle multiple deposits', () => {
	return remitContract.deposit(recipient, "password", 1000, {from: sender, value: amount1})
	    .then(txn => {
		return remitContract.deposit(recipient, "password", 1000, {from: sender, value: amount2});
	    }).then(txn => {
		return remitContract.getDeposits(recipient, "password");
	    }).then(addr => {
		assert.lengthOf(addr, 2, "there should be exactly two deposits");
		deposContract1 = Deposit.at(addr[0]);
		deposContract2 = Deposit.at(addr[1]);
		return web3.eth.getBalance(deposContract1.address);
	    }).then(balance => {
		assert.equal(balance.toString(10), amount1, "deposit should match");
		return web3.eth.getBalance(deposContract2.address);
	    })
	    .then(balance => {
		assert.equal(balance.toString(10), amount2, "deposit should match");
	    })

    });
});
