pragma solidity ^0.4.7;
contract creator {
	function doCreate(uint _value, bytes _code) internal returns (address o_addr) {
		bool failed;
		assembly {
			o_addr := create(_value, add(_code, 0x20), mload(_code))
			failed := iszero(extcodesize(o_addr))
		}
		require(!failed);
	}
}
