pragma solidity 0.4.13;

// Remarks:
//  - Theoretically the landlord can immidiately kick out the tenant a soon as deposit is received and keep their deposit locked in the contract
//  - Landlord does not get compensated for the days a tenant overstays
//  - Rent per blocktime is suboptimal as blocktime is volatile
//  
// Questions:
//  - What's the point of returning success variable?
//  - Is there a better way to handle deposit withdrawals (e.g. iwthout arbitrar?)
//  - For a function that need transactions 
 
contract Rental {
    enum State { VACANT, OCCUPIED }
    State state;

    // nonce used for unique incremental rentalIDs. Note that rentalID
    // starts with 1 and not 0 to disambiguate default value
    uint32 nonce;
    uint32 activeRentalID;
    
    address tenant;
    address landlord;
    address arbitrar;
    
    uint256 requiredDeposit;
    uint256 rent;
    
    uint256 paidRentUntilBlock;
    uint256 totalDeposited;
    bool isTerminated;
    
    struct deposit {
        address depositer;
        uint256 amount;
    }
    
    mapping(uint32 => deposit) deposits;
    mapping(uint32 => int8) depositReleaseVoteSum;
    mapping(uint32 => mapping(address => bool)) depositReleaseVoters;
    
    enum TenantAction { MOVE_IN, MOVE_OUT, KICKED_OUT, TERMINATE }
    enum PaymentType { DEPOSIT_IN, DEPOSIT_OUT, RENT_IN, RENT_OUT }

    event LogTenants(uint32 indexed rentalID, address indexed tenant, TenantAction indexed action);
    event LogPayments(uint32 indexed rentalID, address indexed actor, uint256 amount, PaymentType indexed paymentType);
    
    // Constructor
    function Rental(uint rentalDeposit, uint rentPerBlock, address disputeArbitrar) {
        require(msg.sender != disputeArbitrar);
        
        landlord = msg.sender;
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
            return addr == landlord;
        } else {
            return addr == tenant;
        }
    }
    
    function getRentPaidUntil() public constant returns (uint256) {
        return paidRentUntilBlock;
    }
    
    // anybody can moveIn as long as the deposit is paid in full
    function moveIn() external payable returns (uint32 rentalID) {
        require(state == State.VACANT);
        
        // need to pay the deposit in full or the money will be sent back
        require(msg.value >= requiredDeposit);
        
        tenant = msg.sender;
        
        nonce += 1;
        activeRentalID = nonce;
        
        deposits[activeRentalID] = deposit(msg.sender, msg.value);
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
    function kickOut() external returns (bool success) {
        require(state == State.OCCUPIED);
        require(msg.sender == landlord);
        require(block.number > paidRentUntilBlock);
        
        resetActiveRental();
        
        LogTenants(activeRentalID, tenant, TenantAction.KICKED_OUT);
        
        state = State.VACANT;
        return true;
    }
    
    // for deposits to be released at least 2 parties have to sign. Note that 
    // this can only be submitted once.
    function signDeposit(uint32 rentalID, bool allow) external returns (bool success) {
        bool isLandlord = msg.sender == landlord;
        bool isTenant = msg.sender == tenant;
        bool isArbitrar = msg.sender == arbitrar;
        
        bool hasVoted = depositReleaseVoters[rentalID][msg.sender];
        
        require(rentalID > 0);
        require(isLandlord || isTenant || isArbitrar);
        require(!hasVoted);
        
        int8 voteSum = depositReleaseVoteSum[rentalID];
        
        if (allow) {
            voteSum += 1;
        } else {
            voteSum -= 1;
        }
        
        assert(voteSum > -4 && voteSum < 4);
        
        depositReleaseVoteSum[rentalID] = voteSum;
        depositReleaseVoters[rentalID][msg.sender] = true;
    
        return true;
    }
    
    // depositer can get the deposit back if at least 2 of either landlord, 
    // tenant or arbitrar (3rd party who will decide if there are issues)
    function withdrawDeposit(uint32 rentalID) external returns (bool success) {
        deposit memory dep = deposits[rentalID];
        uint256 withdrawable = dep.amount;
        
        require(rentalID > 0);
        require(withdrawable > 0);
        require(depositReleaseVoteSum[rentalID] >= 2);
        require(msg.sender == dep.depositer);
        
        deposits[rentalID].amount = 0;
        totalDeposited -= dep.amount;
        dep.depositer.transfer(withdrawable);
        
        LogPayments(rentalID, dep.depositer, withdrawable, PaymentType.DEPOSIT_OUT);
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
        
        // TODO is revert needed here?
        if (!extendRent(msg.value)) revert();
        
        LogPayments(activeRentalID, msg.sender, msg.value, PaymentType.RENT_IN);
                
        return true;
    }
    
    function withdrawRent() external returns (bool success) {
        require(msg.sender == landlord);
        require(this.balance > totalDeposited);
        
        uint256 withdrawableAmount = this.balance - totalDeposited;
        
        landlord.transfer(withdrawableAmount);
        LogPayments(activeRentalID, msg.sender, withdrawableAmount, PaymentType.RENT_OUT);
        
        return true;
    }
    
    // landlord is able to terminate the contract by making the tenant unable to
    // pay for future rent
    function terminate() external returns (bool success) {
        require(msg.sender == landlord);
        
        isTerminated = true;
        LogTenants(activeRentalID, landlord, TenantAction.TERMINATE);
        
        return true;
    }
    
    function kill() external returns (bool success) {
        require(msg.sender == landlord);
        require(totalDeposited == 0);
        
        assert(state == State.VACANT);
        
        selfdestruct(landlord);
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
        activeRentalID = 0;
        isTerminated = false;
    }
    
    function() { revert(); }
}
