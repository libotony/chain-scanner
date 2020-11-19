pragma solidity >=0.4.22 <0.7.0;
pragma experimental ABIEncoderV2;

interface Authority {
    /// @notice get infomation about proposer "_signer"
    function get(address _signer) external view returns(bool listed, address endorsor, bytes32 identity, bool active);
    
    /// @notice get the first proposer in the candidates list.
    function first() external view returns(address);

    /// @notice get next one of proposer "_signer"
    function next(address _signer) external view returns(address);
}

interface Params {
    function get(bytes32 _key) external view returns(uint256);
}

contract AuthorityUtils {
    Authority constant authority = Authority(uint72(bytes9("Authority")));
    Params constant params = Params(uint48(bytes6("Params")));

    address constant zero = address(0);
    uint constant maxProposers = 101;

    struct Candidate{
        address master;
        address endorsor;
        bytes32 identity;
        bool active;
    }

    function all() public view returns(Candidate[] memory list){
        address[] memory _container = new address[](200);

        address curr = authority.first();
        uint count=0;
        
        for(;curr != zero;count++){
            _container[count] = curr;
            curr = authority.next(curr);
        }

        Candidate[] memory _all = new Candidate[](count);
        for(uint i = 0; i<count; i++){
            (, address endorsor, bytes32 identity, bool active) = authority.get(_container[i]);
            _all[i] = Candidate(_container[i], endorsor, identity, active);
        }

        return _all;
    }

    function endorsement() public view returns(uint256 _endorsement) {
        return params.get(bytes32(uint256(uint160(bytes20("proposer-endorsement")))));
    }

    function candidates() public view returns(Candidate[] memory list){
        uint256 requirement = endorsement();
        Candidate[] memory _container = new Candidate[](maxProposers);

        address curr = authority.first();
        uint count=0;

        for(;curr!=zero;) {
            (, address endorsor, bytes32 identity, bool active) = authority.get(curr);
            if (endorsor.balance >= requirement && count<maxProposers) {
                _container[count] = Candidate(curr, endorsor, identity, active);
                count++;
            }
            curr = authority.next(curr);
        }

        if (count == maxProposers){
            return _container;
        }else{
            Candidate[] memory _candidate = new Candidate[](count);
            for(uint i=0; i< count; i++){
                _candidate[i]=_container[i];
            }
            return _candidate;
        }
    }

    function inactives() public view returns(Candidate[] memory list){
        uint256 requirement = endorsement();
        Candidate[] memory _container = new Candidate[](maxProposers);

        address curr = authority.first();
        uint count=0;
        uint inActiveCount=0;

        for(;curr!=zero;) {
            (, address endorsor, bytes32 identity, bool active) = authority.get(curr);
            if (endorsor.balance >= requirement && count<maxProposers) {
                if (active==false){
                    _container[inActiveCount] = Candidate(curr, endorsor, identity, active);
                    inActiveCount++;
                }
                count++;
            }
            curr = authority.next(curr);
        }

        if (inActiveCount == maxProposers){
            return _container;
        }else{
            Candidate[] memory _inActives = new Candidate[](inActiveCount);
            for(uint i=0; i< inActiveCount; i++){
                _inActives[i]=_container[i];
            }
            return _inActives;
        }
    }
}
