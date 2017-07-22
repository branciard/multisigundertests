pragma solidity ^0.4.7;
// inheritable "property" contract that enables methods to be protected by placing a linear limit (specifiable)
// on a particular resource per calendar day. is multiowned to allow the limit to be altered. resource that method
// uses is specified in the modifier.

import "./multiowned.sol";


contract daylimitIssue38 is multiowned {

	// METHODS

	// constructor - stores initial daily limit and records the present day's index.
	function daylimitIssue38(uint _limit) {
		m_dailyLimit = _limit;
		m_lastDay = today();
	}
	// (re)sets the daily limit. needs many of the owners to confirm. doesn't alter the amount already spent today.
	function setDailyLimit(uint _newLimit) onlymanyowners(sha3(msg.data)) external {
		m_dailyLimit = _newLimit;
	}
	// resets the amount already spent today. needs many of the owners to confirm.
	function resetSpentToday() onlymanyowners(sha3(msg.data)) external {
		m_spentToday = 0;
	}

	// INTERNAL METHODS

	// checks to see if there is at least `_value` left from the daily limit today. if there is, subtracts it and
	// returns true. otherwise just returns false.
	function underLimit(uint _value) internal onlyowner returns (bool) {
		TestLogForIssue38UnderLimitIsCall(_value);
		// reset the spend limit if we're on a different day to last time.
		if (today() > m_lastDay) {
			m_spentToday = 0;
			m_lastDay = today();
		}
		// check to see if there's enough left - if so, subtract and return true.
		// overflow protection                    // dailyLimit check
		if (m_spentToday + _value >= m_spentToday && m_spentToday + _value <= m_dailyLimit) {
			m_spentToday += _value;
			return true;
		}
		return false;
	}
	// determines today's index.
	function today() private constant returns (uint) { return now / 1 days; }

	// FIELDS
	// LOG for testing https://github.com/paritytech/contracts/issues/38
	event TestLogForIssue38UnderLimitIsCall(uint _value);

	uint public m_dailyLimit;
	uint public m_spentToday;
	uint public m_lastDay;
}
