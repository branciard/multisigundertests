var Wallet = artifacts.require("./Wallet.sol");
var WalletIssue38 = artifacts.require("./WalletIssue38.sol");
var WalletIssue38IfSwapped = artifacts.require("./WalletIssue38IfSwapped.sol");
const Promise = require("bluebird");
//extensions.js : credit to : https://github.com/coldice/dbh-b9lab-hackathon/blob/development/truffle/utils/extensions.js
const Extensions = require("../utils/extensions.js");
const addEvmFunctions = require("../utils/evmFunctions.js");
addEvmFunctions(web3);
Promise.promisifyAll(web3.eth, {
  suffix: "Promise"
});
Promise.promisifyAll(web3.version, {
  suffix: "Promise"
});
Promise.promisifyAll(web3.evm, {
  suffix: "Promise"
});
Extensions.init(web3, assert);

contract('Wallet', function(accounts) {

  var creator, ownerA, ownerB, ownerC;
  var amountGazProvided = 3000000;
  let isTestRPC;

  before("should prepare accounts and check TestRPC Mode", function() {
    assert.isAtLeast(accounts.length, 4, "should have at least 4 accounts");
    creator = accounts[0];
    ownerA = accounts[1];
    ownerB = accounts[2];
    ownerC = accounts[3];
    receiver1 = accounts[4];
    return Extensions.makeSureAreUnlocked(
        [creator, ownerA, ownerB, ownerC, receiver1])
      .then(() => web3.eth.getBalancePromise(creator))
      .then(balance => assert.isTrue(
        web3.toWei(web3.toBigNumber(90), "ether").lessThan(balance),
        "creator should have at least 90 ether, not " + web3.fromWei(balance, "ether")))
      .then(() => Extensions.refillAccount(creator, ownerA, 10))
      .then(() => Extensions.refillAccount(creator, ownerB, 10))
      .then(() => Extensions.refillAccount(creator, ownerC, 10))
      .then(() => Extensions.refillAccount(creator, receiver1, 10))
      .then(() => web3.version.getNodePromise())
      .then(node => isTestRPC = node.indexOf("EthereumJS TestRPC") >= 0);

  });

  describe("Test Multisig wallet contract with 2 owners, 1 required for tx, daylimit 2 ether", function() {

    var aWalletInstance;

    beforeEach("create a new contract instance", function() {
      //Wallet(address[] _owners, uint _required, uint _daylimit)
      return Wallet.new([ownerA, ownerB], 1, web3.toWei(web3.toBigNumber(2), "ether"), {
          from: creator,
          gas: amountGazProvided
        })
        .then(instance => {
          aWalletInstance = instance;
        });
    });

    it("Multisig wallet 0 balance after creation", function() {
      return web3.eth.getBalancePromise(aWalletInstance.address)
        .then(balance => {
          assert.strictEqual(0, balance.toNumber(), "0 balance");
        });
    });

    it("ownerA send 1 ether to it, and then ownerA can sent this ether to receiver1", function() {
      var intialRecever1Balance;
      //send 1 ether to it
      return web3.eth.sendTransactionPromise({
          from: ownerA,
          to: aWalletInstance.address,
          gas: amountGazProvided,
          value: web3.toWei(web3.toBigNumber(1), "ether")
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent);
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          return Promise.all([
            web3.eth.getBalancePromise(aWalletInstance.address),
            web3.eth.getBalancePromise(receiver1)
          ]);
        })
        .then(balances => {
          assert.strictEqual(web3.toWei(1, "ether"), balances[0].toString(10), " 1 ether on multisig wallet");
          intialRecever1Balance = balances[1];
          //and then ownerA can sent this ether to receiver1"
          return aWalletInstance.execute(receiver1, web3.toWei(1, "ether"), "execute", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(receiver1);
        })
        .then(balance => {
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(1, "ether")).toString(10), "receiver1 must received 1 ether comming from the multisig wallet");
        });
    });

    it("the dailyLimit is not active when 1 required. ok why not. dailyLimit is 2 but 4 is spent", function() {
      var intialRecever1Balance;
      //send 1 ether to it
      return web3.eth.sendTransactionPromise({
          from: ownerA,
          to: aWalletInstance.address,
          gas: amountGazProvided,
          value: web3.toWei(web3.toBigNumber(4), "ether")
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent);
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          return Promise.all([
            web3.eth.getBalancePromise(aWalletInstance.address),
            web3.eth.getBalancePromise(receiver1)
          ]);
        })
        .then(balances => {
          assert.strictEqual(web3.toWei(4, "ether"), balances[0].toString(10), " 4 ethers on multisig wallet");
          intialRecever1Balance = balances[1];
          //and then ownerA can sent this ether to receiver1"
          return aWalletInstance.execute(receiver1, web3.toWei(2, "ether"), "execute", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(receiver1);
        })
        .then(balance => {
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(2, "ether")).toString(10), "receiver1 must received 2 ethers comming from the multisig wallet");
          return Promise.all([
            aWalletInstance.m_dailyLimit.call(),
            aWalletInstance.m_spentToday.call(),
            aWalletInstance.m_lastDay.call(),
          ]);

        })
        .then(daylimitfields => {
          [m_dailyLimit, m_spentToday, m_lastDay] = daylimitfields;
          //console.log(m_dailyLimit);
          //console.log(m_spentToday);
          //console.log(m_lastDay);
          return aWalletInstance.execute(receiver1, web3.toWei(2, "ether"), "execute", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(receiver1);
        })
        .then(balance => {
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(4, "ether")).toString(10), "receiver1 must received 4 ethers comming from the multisig wallet");
          return Promise.all([
            aWalletInstance.m_dailyLimit.call(),
            aWalletInstance.m_spentToday.call(),
            aWalletInstance.m_lastDay.call(),
          ]);

        })
        .then(daylimitfields => {
          [m_dailyLimit, m_spentToday, m_lastDay] = daylimitfields;
          //console.log(m_dailyLimit);
          //console.log(m_spentToday); //do not change
          //console.log(m_lastDay);
        });
    });
  });



  describe("Test Multisig wallet contract with 2 owners, 2 required for tx, daylimit 2 ethers", function() {

    var aWalletInstance;

    beforeEach("create a new contract instance", function() {
      //Wallet(address[] _owners, uint _required, uint _daylimit)
      return Wallet.new([ownerA, ownerB], 2, web3.toWei(web3.toBigNumber(2), "ether"), {
          from: creator,
          gas: amountGazProvided
        })
        .then(instance => {
          aWalletInstance = instance;
        });
    });

    it("Multisig wallet 0 balance after creation", function() {
      return web3.eth.getBalancePromise(aWalletInstance.address)
        .then(balance => {
          assert.strictEqual(0, balance.toNumber(), "0 balance");
        });
    });

    it("ownerA send 1 ether to it, and then ownerA can sent this ether to receiver1 after owner B has confirmed", function() {
      var intialRecever1Balance;
      var operationToConfirm;
      //send 1 ether to it
      return web3.eth.sendTransactionPromise({
          from: ownerA,
          to: aWalletInstance.address,
          gas: amountGazProvided,
          value: web3.toWei(web3.toBigNumber(1), "ether")
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent);
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          return Promise.all([
            web3.eth.getBalancePromise(aWalletInstance.address),
            web3.eth.getBalancePromise(receiver1)
          ]);
        })
        .then(balances => {
          assert.strictEqual(web3.toWei(1, "ether"), balances[0].toString(10), " 1 ether on multisig wallet");
          intialRecever1Balance = balances[1];
          return aWalletInstance.execute.call(receiver1, web3.toWei(1, "ether"), "execute", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(executeCall => {
          return aWalletInstance.execute(receiver1, web3.toWei(1, "ether"), "execute", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.strictEqual(txMined.logs[1].event, "ConfirmationNeeded", "ConfirmationNeeded from ownerB");
          operationToConfirm = txMined.logs[1].args.operation;
          return aWalletInstance.confirm(operationToConfirm, {
            from: ownerB,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(receiver1);
        })
        .then(balance => {
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(1, "ether")).toString(10), "receiver1 must received 1 ether comming from the multisig wallet");
        });
    });

    it("DailyLimit do not work when we invoke execute fonction with _data length not equal to 0", function() {
      var intialRecever1Balance;
      //1 ) ownerA load the multisig wallet with 4 ethers
      //2 ) ownerA invoke execute to Send 2 ethers to receiver1. we fill _data with "the sky's the limit"
      //3 ) ownerB confirm
      //4 ) receiver1  received 2 ethers
      //5 ) ownerA invoke execute to Send 2 ethers to receiver1. we fill _data with "the sky's the limit"
      //6 ) ownerB confirm
      //7 ) receiver1  received 2 ethers. receiver1 has now 4 ethers
      // So ownerA,ownerB has spent 4 ethers on a multisigwallet with a limit of 2 ethers DailyLimit ?
      return web3.eth.sendTransactionPromise({
          from: ownerA,
          to: aWalletInstance.address,
          gas: amountGazProvided,
          value: web3.toWei(web3.toBigNumber(4), "ether")
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent);
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          return Promise.all([
            web3.eth.getBalancePromise(aWalletInstance.address),
            web3.eth.getBalancePromise(receiver1)
          ]);
        })
        .then(balances => {
          //1 ) ownerA load the multisig wallet with 4 ethers
          assert.strictEqual(web3.toWei(4, "ether"), balances[0].toString(10), " 4 ethers on multisig wallet");
          intialRecever1Balance = balances[1];
          //2 ) ownerA invoke execute to Send 2 ethers to receiver1. we fill _data with "the sky's the limit"
          return aWalletInstance.execute(receiver1, web3.toWei(2, "ether"), "the sky's the limit", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.strictEqual(txMined.logs[1].event, "ConfirmationNeeded", "ConfirmationNeeded from ownerB");
          operationToConfirm = txMined.logs[1].args.operation;
          //3 ) ownerB confirm
          return aWalletInstance.confirm(operationToConfirm, {
            from: ownerB,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(receiver1);
        })
        .then(balance => {
          //4 ) receiver1  received 2 ethers
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(2, "ether")).toString(10), "receiver1 must received 2 ethers comming from the multisig wallet");
          return Promise.all([
            aWalletInstance.m_dailyLimit.call(),
            aWalletInstance.m_spentToday.call(),
            aWalletInstance.m_lastDay.call(),
          ]);
        })
        .then(daylimitfields => {
          [m_dailyLimit, m_spentToday, m_lastDay] = daylimitfields;
          assert.strictEqual(web3.toWei(2, "ether").toString(10), m_dailyLimit.toString(10), "m_dailyLimit is 2 ethers");
          //console.log(m_dailyLimit);
          assert.strictEqual(web3.toWei(0, "ether").toString(10), m_spentToday.toString(10), "m_spentToday shoud have been 2 ethers. it is 0 here !");
          //console.log(m_spentToday);
          //console.log(m_lastDay);
          //5 ) ownerA invoke execute to Send 2 ethers to receiver1. we fill _data with "the sky's the limit"
          return aWalletInstance.execute(receiver1, web3.toWei(2, "ether"), "the sky's the limit", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.strictEqual(txMined.logs[1].event, "ConfirmationNeeded", "ConfirmationNeeded from ownerB");
          operationToConfirm = txMined.logs[1].args.operation;
          //6 ) ownerB confirm
          return aWalletInstance.confirm(operationToConfirm, {
            from: ownerB,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(receiver1);
        })
        .then(balance => {
          //7 ) receiver1  received 2 ethers. receiver1 has now 4 ethers
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(4, "ether")).toString(10), "we succed to send 4 ethers to receiver1 with a dailylimit at 2 ethers ...");
          return Promise.all([
            aWalletInstance.m_dailyLimit.call(),
            aWalletInstance.m_spentToday.call(),
            aWalletInstance.m_lastDay.call(),
          ]);
        })
        .then(daylimitfields => {
          [m_dailyLimit, m_spentToday, m_lastDay] = daylimitfields;
          assert.strictEqual(web3.toWei(2, "ether").toString(10), m_dailyLimit.toString(10), "m_dailyLimit is 2 ethers");
          //console.log(m_dailyLimit);
          assert.strictEqual(web3.toWei(0, "ether").toString(10), m_spentToday.toString(10), "m_spentToday still 0 here !");
          //console.log(m_spentToday);
          //console.log(m_lastDay);
        });
    });
  });


  describe("Test WalletIssue38 : if ((_data.length == 0 && underLimit(_value)) || m_required == 1) { ", function() {

    var aWalletInstance;

    beforeEach("create a new contract instance", function() {
      //Wallet(address[] _owners, uint _required, uint _daylimit)
      return WalletIssue38.new([ownerA, ownerB], 2, web3.toWei(web3.toBigNumber(2), "ether"), {
          from: creator,
          gas: amountGazProvided
        })
        .then(instance => {
          aWalletInstance = instance;
        });
    });

    it("Multisig wallet 0 balance after creation", function() {
      return web3.eth.getBalancePromise(aWalletInstance.address)
        .then(balance => {
          assert.strictEqual(0, balance.toNumber(), "0 balance");
        });
    });

    it("if ((_data.length == 0 && underLimit(_value)) || m_required == 1)", function() {
      var intialRecever1Balance;
      return web3.eth.sendTransactionPromise({
          from: ownerA,
          to: aWalletInstance.address,
          gas: amountGazProvided,
          value: web3.toWei(web3.toBigNumber(4), "ether")
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent);
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          return Promise.all([
            web3.eth.getBalancePromise(aWalletInstance.address),
            web3.eth.getBalancePromise(receiver1)
          ]);
        })
        .then(balances => {
          assert.strictEqual(web3.toWei(4, "ether"), balances[0].toString(10), " 4 ethers on multisig wallet");
          intialRecever1Balance = balances[1];
          return aWalletInstance.execute(receiver1, web3.toWei(2, "ether"), "the sky's the limit", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          console.log(txMined.logs);
          assert.notEqual(txMined.logs[0].event, "TestLogForIssue38UnderLimitIsCall", "function underLimit is called");
          assert.strictEqual(txMined.logs[0].event, "Confirmation", "txMined.logs[0] is Confirmation -> it is not  event TestLogForIssue38UnderLimitIsCall -> function underLimit never called !");
        });
    });
  });

  describe("Test WalletIssue38IfSwapped  : if (( underLimit(_value) == 0 && _data.length ) || m_required == 1) { ", function() {

    var aWalletInstance;

    beforeEach("create a new contract instance", function() {
      //Wallet(address[] _owners, uint _required, uint _daylimit)
      return WalletIssue38IfSwapped.new([ownerA, ownerB], 2, web3.toWei(web3.toBigNumber(2), "ether"), {
          from: creator,
          gas: amountGazProvided
        })
        .then(instance => {
          aWalletInstance = instance;
        });
    });

    it("Multisig wallet 0 balance after creation", function() {
      return web3.eth.getBalancePromise(aWalletInstance.address)
        .then(balance => {
          assert.strictEqual(0, balance.toNumber(), "0 balance");
        });
    });

    it("if (( underLimit(_value) == 0 && _data.length ) || m_required == 1) { ", function() {
      var intialRecever1Balance;
      return web3.eth.sendTransactionPromise({
          from: ownerA,
          to: aWalletInstance.address,
          gas: amountGazProvided,
          value: web3.toWei(web3.toBigNumber(4), "ether")
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent);
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          return Promise.all([
            web3.eth.getBalancePromise(aWalletInstance.address),
            web3.eth.getBalancePromise(receiver1)
          ]);
        })
        .then(balances => {
          assert.strictEqual(web3.toWei(4, "ether"), balances[0].toString(10), " 4 ethers on multisig wallet");
          intialRecever1Balance = balances[1];
          return aWalletInstance.execute(receiver1, web3.toWei(2, "ether"), "the sky's the limit", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          console.log(txMined.logs);
          assert.strictEqual(txMined.logs[0].event, "TestLogForIssue38UnderLimitIsCall", "function underLimit is called");
          assert.notEqual(txMined.logs[0].event, "Confirmation", "Confirmation is not in logs[0] index ");
          assert.strictEqual(txMined.logs[1].event, "Confirmation", "Confirmation is in logs[1] index ");
        });
    });
  });

});
