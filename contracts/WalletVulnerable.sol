//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE

pragma solidity ^0.4.7;

import "./multisig.sol";
import "./multiownedVulnerable.sol";
import "./daylimitVulnerable.sol";
import "./creator.sol";
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
contract WalletVulnerable is multisig, multiownedVulnerable, daylimitVulnerable, creator {

	// TYPES

	// Transaction structure to remember details of transaction lest it need be saved for a later call.
	struct Transaction {
		address to;
		uint value;
		bytes data;
	}

	// METHODS
	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	function WalletVulnerable(address[] _owners, uint _required, uint _daylimit)
			multiownedVulnerable(_owners, _required) daylimitVulnerable(_daylimit) {
	}

	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	function kill(address _to) onlymanyowners(sha3(msg.data)) external {
		suicide(_to);
	}

	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	function() payable {
		// just being sent some cash?
		if (msg.value > 0)
			Deposit(msg.sender, msg.value);
	}
	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	function execute(address _to, uint _value, bytes _data) external onlyowner returns (bytes32 o_hash) {
		// first, take the opportunity to check that we're under the daily limit.
		if ((_data.length == 0 && underLimit(_value)) || m_required == 1) {
			// yes - just execute the call.
			address created;
			if (_to == 0) {
				created = create(_value, _data);
			} else {
				require(_to.call.value(_value)(_data));
			}
			SingleTransact(msg.sender, _value, _to, _data, created);
		} else {
			// determine our operation hash.
			o_hash = sha3(msg.data, block.number);
			// store if it's new
			if (m_txs[o_hash].to == 0 && m_txs[o_hash].value == 0 && m_txs[o_hash].data.length == 0) {
				m_txs[o_hash].to = _to;
				m_txs[o_hash].value = _value;
				m_txs[o_hash].data = _data;
			}
			if (!confirm(o_hash)) {
				ConfirmationNeeded(o_hash, msg.sender, _value, _to, _data);
			}
		}
	}

	function create(uint _value, bytes _code) internal returns (address o_addr) {
		return doCreate(_value, _code);
	}

	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	//DO NOT USE IT IS VULNERABLE. ONLY  FOR TESTING PURPUSE
	function confirm(bytes32 _h) onlymanyowners(_h) returns (bool o_success) {
		if (m_txs[_h].to != 0 || m_txs[_h].value != 0 || m_txs[_h].data.length != 0) {
			address created;
			if (m_txs[_h].to == 0) {
				created = create(m_txs[_h].value, m_txs[_h].data);
			} else {
				require(m_txs[_h].to.call.value(m_txs[_h].value)(m_txs[_h].data));
			}

			MultiTransact(msg.sender, _h, m_txs[_h].value, m_txs[_h].to, m_txs[_h].data, created);
			delete m_txs[_h];
			return true;
		}
	}

	// INTERNAL METHODS

	function clearPending() internal {
		uint length = m_pendingIndex.length;
		for (uint i = 0; i < length; ++i)
			delete m_txs[m_pendingIndex[i]];
		super.clearPending();
	}

	// FIELDS

	// pending transactions we have at present.
	mapping (bytes32 => Transaction) m_txs;
}
