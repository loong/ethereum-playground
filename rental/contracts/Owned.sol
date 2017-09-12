pragma solidity 0.4.13;

contract Owned {
    address public owner;
    mapping(address => bool) public verifiedOwners;
    
    event LogOwners(address indexed newOwner);
    
    function Owned() {
        owner = msg.sender;
        LogOwners(owner);
    }
    
    modifier isOwner() {
        require(msg.sender == owner);
        _;
    }
    
    // to ensure we don't change ownership to an account we don't control
    // require to verify the account by calling this function first
    function verifyNewOwner() public returns (bool success) {
        verifiedOwners[msg.sender] = true;
        return true;
    }
    
    // changes the owner, given the newOwner is verified
    function changeOwner(address newOwner) public isOwner returns (bool success) {
        require(verifiedOwners[newOwner]);
        owner = newOwner;
        LogOwners(owner);
        return true;
    }
}