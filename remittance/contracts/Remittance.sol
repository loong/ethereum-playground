pragma solidity 0.4.13;

contract Deposit {
    address owner;
    bytes32 secret;
    uint256 deadline;
    
    function Deposit(address depositOwner, bytes32 hashedSecret, uint256 blocksTillDeadline) payable {
        require(msg.value > 0);

        owner = depositOwner;
        secret = hashedSecret;
        deadline = block.number + blocksTillDeadline;
    }
    
    function withdraw(bytes32 passwd) public {
        require(sha3(msg.sender, passwd) == secret);
        msg.sender.transfer(this.balance); // use selfdestruct here instead?
    }
    
    function refund() public {
        require(msg.sender == owner);
        require(block.number >= deadline);
        
        owner.transfer(this.balance); // use selfdestruct here instead?
    }
}

contract Remittance {
    mapping(bytes32 => Deposit[]) deposits;
    
    function deposit(address recipient, bytes32 passwd, uint256 blocksTillDeadline) payable public returns(address depposit){
        require(msg.value > 0);
        
        bytes32 secret = sha3(recipient, passwd);
        Deposit deposit = (new Deposit).value(msg.value)(msg.sender, secret, blocksTillDeadline);
        deposits[secret].push(deposit);
        
        return deposit;
    }
    
    function getDeposits(address recipient, bytes32 passwd) constant public returns (Deposit[]) {
        return deposits[sha3(recipient, passwd)];
    }
}