var Rental = artifacts.require("./Rental.sol");

module.exports = function(deployer) {
  web3.eth.getAccounts(function(err, res) {
    deployer.deploy(Rental, web3.toWei(1, "ether"), web3.toWei(0.000001, "ether"), res[2]);
  });
};
