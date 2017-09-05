pragma solidity 0.4.13;

import './Splitter.sol';

contract FixSplitter {
    address addr1;
    address addr2;
    
    Splitter splitterContract;
    
    function FixSplitter(address splitAddr1, address splitAddr2) {
        require(splitAddr1 != 0);
        require(splitAddr2 != 0);

        addr1 = splitAddr1;
        addr2 = splitAddr2;
        
        splitterContract = new Splitter();
    }
    
    function split() public payable returns (bool success) {
        // this is actually checked by Splitter contract, but better to fail fast?
        require(msg.value > 0); 
        
        return splitterContract.split.value(msg.value)(msg.sender, addr1, addr2);
    }
    
    function withdraw() public returns (bool success){
        return splitterContract.withdraw(msg.sender);
    }

    function checkBalance(address addr) constant returns (uint256) {
    	return splitterContract.checkBalance(addr);
    }
}