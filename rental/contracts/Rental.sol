pragma solidity 0.4.13;

// Remarks:
//  - Theoretically the landlord can immidiately kick out the tenant a soon as deposit is received and keep their deposit locked in the contract
//  - Landlord does not get compensated for the days a tenant overstays
//  - Rent per blocktime is suboptimal as blocktime is volatile
  
// Questions:
//  - Is there a better way to handle deposit withdrawals (e.g. without arbitrar?)
 
import "./Owned.sol";

contract Rental is Owned {
    enum State { VACANT, OCCUPIED }
    State private state;

    // nonce used for unique incremental rentalIDs. Note that rentalID starts with 1 and not 0 to disambiguate default value 
    uint32 public nonce;
    bytes32 public activeRentalID;
    
    address public tenant;
    address public arbitrar;
    
    uint256 public requiredDeposit;
    uint256 public rent;
    
    uint256 public paidRentUntilBlock;
    uint256 private totalDeposited;
    bool public isTerminated;
    
    struct deposit {
        address depositer;
        uint256 amount;
        
        // To keep track who has signed the deposit
        mapping(address => bool) voters;
        
        // To keep track on the results the following way:
        //   - add 1 if signer agrees on the deposit withdrawal
        //   - subtract 1 if signer disagree with deposit withdrawal
        int8 voteSum;
    }
    
    mapping(bytes32 => deposit) public deposits;
    
    enum TenantAction { MOVE_IN, MOVE_OUT, KICKED_OUT, TERMINATE }
    enum PaymentType { DEPOSIT_IN, DEPOSIT_OUT, RENT_IN, RENT_OUT }

    event LogTenants(bytes32 indexed rentalID, address indexed tenant, TenantAction indexed action);
    event LogPayments(bytes32 indexed rentalID, address indexed actor, uint256 amount, PaymentType indexed paymentType);
    
    // Constructor
    function Rental(uint rentalDeposit, uint rentPerBlock, address disputeArbitrar) {
        require(msg.sender != disputeArbitrar);
        
        requiredDeposit = rentalDeposit;
        rent = rentPerBlock;
        arbitrar = disputeArbitrar;
        
        state = State.VACANT;
    }
    
    function isVacant() public constant returns (bool) {
        return state == State.VACANT;
    }
    
    // e.g. a smart lock can use this to check authorization
    function hasAccess(address addr) public constant returns (bool) {
        if (state == State.VACANT) {
            return addr == owner;
        } else {
            return addr == tenant;
        }
    }
    
    // anybody can moveIn as long as the deposit is paid in full
    function moveIn() external payable returns (bytes32 rentalID) {
        require(state == State.VACANT);
        
        // need to pay the deposit in full or the money will be sent back
        require(msg.value >= requiredDeposit);
        
        tenant = msg.sender;
        
        nonce += 1;
        activeRentalID = keccak256(nonce, tenant);
        
        deposit memory dep;
        dep.depositer = msg.sender;
        dep.amount = msg.value;
        deposits[activeRentalID] = dep;
        totalDeposited += msg.value;
        paidRentUntilBlock = block.number;
        
        LogPayments(activeRentalID, tenant, msg.value, PaymentType.DEPOSIT_IN);
        LogTenants(activeRentalID, tenant, TenantAction.MOVE_IN);
        
        state = State.OCCUPIED;
        return activeRentalID;
    }
    
    // tenant can move out as long as rent is paid
    function moveOut() external returns (bool success) {
        require(state == State.OCCUPIED);
        require(msg.sender == tenant);
        require(block.number <= paidRentUntilBlock);
        
        resetActiveRental();

        LogTenants(activeRentalID, tenant, TenantAction.MOVE_OUT);
        
        state = State.VACANT;
        return true;
    }
    
    // landlord can kick out the tenant if the rent is due
    function kickOut() external isOwner returns (bool success) {
        require(state == State.OCCUPIED);
        require(block.number > paidRentUntilBlock);
        
        resetActiveRental();
        
        LogTenants(activeRentalID, tenant, TenantAction.KICKED_OUT);
        
        state = State.VACANT;
        return true;
    }
    
    // for deposits to be released at least 2 parties have to sign. Note that 
    // this can only be submitted once.
    function signDeposit(bytes32 rentalID, bool allow) external returns (bool success) {
        deposit storage dep = deposits[rentalID]; // points directly to storage
        
        bool isLandlord = msg.sender == owner;
        bool isTenant = msg.sender == tenant;
        bool isArbitrar = msg.sender == arbitrar;
        bool isValidRentalID = dep.amount > 0;
        
        bool hasVoted = dep.voters[msg.sender];
        
        require(isValidRentalID);
        require(isLandlord || isTenant || isArbitrar);
        require(!hasVoted);
        
        int8 voteSum = dep.voteSum;
        
        if (allow) {
            voteSum += 1;
        } else {
            voteSum -= 1;
        }
        
        assert(voteSum > -4 && voteSum < 4);
        
        dep.voteSum = voteSum;
        dep.voters[msg.sender] = true;
        
        return true;
    }
    
    // depositer can get the deposit back if at least 2 of either landlord, 
    // tenant or arbitrar (3rd party who will decide if there are issues)
    function withdrawDeposit(bytes32 rentalID) external returns (bool success) {
        deposit storage dep = deposits[rentalID]; // caution is pointer
        uint256 withdrawable = dep.amount;

        require(withdrawable > 0);
        require(dep.voteSum >= 2);
        require(msg.sender == dep.depositer);
        
        dep.amount = 0;
        totalDeposited -= dep.amount;
        dep.depositer.transfer(withdrawable);
        
        LogPayments(rentalID, dep.depositer, withdrawable, PaymentType.DEPOSIT_OUT);
        return true;
    }
    
    // landlord can claim the deposit if at least 2 of either landlord, 
    // tenant or arbitrar disagree with the return of the deposit
    function claimDeposit(bytes32 rentalID) external isOwner returns (bool success) {
        deposit storage dep = deposits[rentalID]; // caution is pointer
        uint256 withdrawable = dep.amount;

        require(withdrawable > 0);
        require(dep.voteSum <= -2);

        dep.amount = 0;
        totalDeposited -= dep.amount;
        owner.transfer(withdrawable);
        
        LogPayments(rentalID, owner, withdrawable, PaymentType.DEPOSIT_OUT);
        return true;
    }
    
    // anybody is able to pay rent, however, you can only pay at most ~6 months 
    // in advance (to protect landlord of someone claiming the property for like 
    // 100 years)
    function payRent() external payable returns(bool success) {
        require(state == State.OCCUPIED);
        require(!isTerminated);
        
        // only allow a maximum pay of 6 months ahead
        // BlockTime = 20s
        // 3*60*24*90 = 388800
        require(msg.value > 0 && msg.value < rent*388800);
        
        if (!extendRent(msg.value)) revert();
        
        LogPayments(activeRentalID, msg.sender, msg.value, PaymentType.RENT_IN);
                
        return true;
    }
    
    function withdrawRent() external isOwner returns (bool success) {
        require(this.balance > totalDeposited);
        
        uint256 withdrawableAmount = this.balance - totalDeposited;
        
        owner.transfer(withdrawableAmount);
        LogPayments(activeRentalID, msg.sender, withdrawableAmount, PaymentType.RENT_OUT);
        
        return true;
    }
    
    // landlord is able to terminate the contract by making the tenant unable to
    // pay for future rent
    function terminate() external isOwner returns (bool success) {
        isTerminated = true;
        LogTenants(activeRentalID, owner, TenantAction.TERMINATE);
        
        return true;
    }
    
    function kill() external isOwner returns (bool success) {
        require(totalDeposited == 0);
        
        assert(state == State.VACANT);
        
        selfdestruct(owner);
        return true;
    }
    
    function extendRent(uint256 amountPaid) private returns (bool success) {
        uint256 extendRentalBy = amountPaid / rent;
        uint256 remainder = amountPaid - extendRentalBy*rent;
        
        // send back remainder if needed
        if (remainder > 0) {
            msg.sender.transfer(remainder);
        }
        
        paidRentUntilBlock += extendRentalBy;
        return true;
    }
    
    function resetActiveRental() private {
        tenant = 0;
        activeRentalID = "";
        isTerminated = false;
    }
    
    function() { revert(); }
}
