//sol Wallet
// Multi-sig, daily-limited account proxy/wallet.
// @authors:
// Gav Wood <g@ethdev.com>
// inheritable "property" contract that enables methods to be protected by requiring the acquiescence of either a
// single, or, crucially, each of a number of, designated owners.
// usage:
// use modifiers onlyowner (just own owned) or onlymanyowners(hash), whereby the same hash must be provided by
// some number (specified in constructor) of the set of owners (specified in the constructor, modifiable) before the
// interior is executed.

pragma solidity ^0.4.7;

import "./multisig.sol";
import "./multiowned.sol";
import "./daylimitIssue38.sol";
import "./creator.sol";
// usage:
// bytes32 h = Wallet(w).from(oneOwner).execute(to, value, data);
// Wallet(w).from(anotherOwner).confirm(h);

// usage:
// bytes32 h = Wallet(w).from(oneOwner).execute(to, value, data);
// Wallet(w).from(anotherOwner).confirm(h);
contract WalletIssue38 is multisig, multiowned, daylimitIssue38, creator {

	// TYPES

	// Transaction structure to remember details of transaction lest it need be saved for a later call.
	struct Transaction {
		address to;
		uint value;
		bytes data;
	}

	// METHODS

	// constructor - just pass on the owner array to the multiowned and
	// the limit to daylimit
	function WalletIssue38(address[] _owners, uint _required, uint _daylimit)
			multiowned(_owners, _required) daylimitIssue38(_daylimit) {
	}

	// kills the contract sending everything to `_to`.
	function kill(address _to) onlymanyowners(sha3(msg.data)) external {
		suicide(_to);
	}

	// gets called when no other function matches
	function() payable {
		// just being sent some cash?
		if (msg.value > 0)
			Deposit(msg.sender, msg.value);
	}

	// Outside-visible transact entry point. Executes transaction immediately if below daily spend limit.
	// If not, goes into multisig process. We provide a hash on return to allow the sender to provide
	// shortcuts for the other confirmations (allowing them to avoid replicating the _to, _value
	// and _data arguments). They still get the option of using them if they want, anyways.
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

	// confirm a transaction through just the hash. we use the previous transactions map, m_txs, in order
	// to determine the body of the transaction from the hash provided.
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
