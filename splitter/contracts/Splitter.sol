pragma solidity 0.4.13;

contract Splitter {
    mapping(address => uint256) balances;
    
    function split(address addr1, address addr2) public payable returns(bool success) {
        require(msg.value > 1);
        require(addr1 != 0);
        require(addr2 != 0);
        
        if (msg.value % 2 == 1) {
            balances[tx.origin] += 1;
        }
        
        uint256 half = msg.value/2;
        
        balances[addr1] += half;
        balances[addr2] += half;
        
        return true;
    }
    
    function withdraw() returns(bool success) {
        uint256 amount = balances[tx.origin];
        require(amount > 0);
        
        balances[tx.origin] = 0;
        tx.origin.transfer(amount);
        
        return true;
    }
    
    function checkBalance(address addr) constant returns (uint256) {
        return balances[addr];
    }
}