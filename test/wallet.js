var Wallet = artifacts.require("./Wallet.sol");
var WalletIssue38 = artifacts.require("./WalletIssue38.sol");
var WalletIssue38IfSwapped = artifacts.require("./WalletIssue38IfSwapped.sol");
var WalletAttacker = artifacts.require("./WalletAttacker.sol");
var WalletVulnerable = artifacts.require("./WalletVulnerable.sol");

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
      .then(() => Extensions.refillAccount(creator, ownerA, 50))
      .then(() => Extensions.refillAccount(creator, ownerB, 2))
      .then(() => Extensions.refillAccount(creator, ownerC, 2))
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
          assert.strictEqual(txMined.logs[0].event, "TestLogForIssue38UnderLimitIsCall", "function underLimit is called");
          assert.notEqual(txMined.logs[0].event, "Confirmation", "Confirmation is not in logs[0] index ");
          assert.strictEqual(txMined.logs[1].event, "Confirmation", "Confirmation is in logs[1] index ");
        });
    });
  });

  describe("Test Multisig wallet contract with 2 owners, 2 required for tx, daylimit 2 ether. test just for log find tx input details", function() {

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
          return aWalletInstance.execute(receiver1, web3.toWei(1, "ether"), "555556", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.strictEqual(txMined.logs[1].event, "ConfirmationNeeded", "ConfirmationNeeded from ownerB");
          operationToConfirm = txMined.logs[1].args.operation;
          return web3.eth.getTransactionPromise(txMined.tx);
        })
        .then(txSent => {
          //      console.log("txSent : ");
          //      console.log(txSent);
          /* log result :
          txSent :
  { hash: '0x5aaaf8814b948c3cb2cb256ade20e9eaa66ceb912af64aff279f44c15d717216',
    nonce: 18,
    blockHash: '0x7778ea869be1985627b1d4789c4bc997df2fde1b8ee4dd087c6b9796ebf86a8c',
    blockNumber: 44,
    transactionIndex: 0,
    from: '0x653ccd9c2523a3dafa72d3caf904f9fd46a2f6d1',
    to: '0x97025e84f74dbb944f67867d2678490cc232f732',
    value: { [String: '0'] s: 1, e: 0, c: [ 0 ] },
    gas: 4712388,
    gasPrice: { [String: '100000000000'] s: 1, e: 11, c: [ 100000000000 ] },
    input: '0xb61d27f600000000000000000000000098735eb4b3d2fc1f175b8d16e580b58ebdd9a5550000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000$00000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000000287a2400000000000000000000000000000000000000000000000000000000000' }
    */

          // confirm 0xb61d27f6 :
          //execute(address _to, uint _value, bytes _data)
          //execute(address,uint256,bytes) =>Keccak-256 online hash function  https://emn178.github.io/online-tools/keccak_256.html =>
          //=> b61d27f68746b0955d4867ce6e77d35c62208909547ca5c62d2a533c00d5b837
          //so 0xb61d27f6 =  for execute(address _to, uint _value, bytes _data)
          //check also with :


          //  console.log("web3.sha3 of execute(address,uint256,bytes)=>"+web3.sha3("execute(address,uint256,bytes)"));


          //log result :
          //web3.sha3 of execute(address,uint256,bytes)=>0xb61d27f68746b0955d4867ce6e77d35c62208909547ca5c62d2a533c00d5b837


          //input exemple for aWalletInstance.execute(receiver1, web3.toWei(1, "ether"), "555556" sent :
          //  input splitted :
          //0xb61d27f6 == execute(address,uint256,bytes)
          //00000000000000000000000098735eb4b3d2fc1f175b8d16e580b58ebdd9a555 ==address
          //0000000000000000000000000000000000000000000000000de0b6b3a7640000 == uint _value 1 ether
          //0000000000000000000000$00000000000000000000000000000000000000060 == ?
          //0000000000000000000000000000000000000000000000000000000000000002 == ?
          //87a2400000000000000000000000000000000000000000000000000000000000 ==bytes _data

          //00000000000000000000000000000000000000000000000029a2241af62c0000 === uint _value 3 ethers

          //0000000000000000000000000000000000000000000000001bc16d674ec80000 === uint _value 2 ethers


          return aWalletInstance.confirm(operationToConfirm, {
            from: ownerB,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getTransactionPromise(txMined.tx);
        })
        .then(txSent => {
          //    console.log("confirm txSent:");
          //    console.log(txSent);
          return web3.eth.getBalancePromise(receiver1);
        })
        .then(balance => {
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(1, "ether")).toString(10), "receiver1 must received 1 ether comming from the multisig wallet");
        });
    });
  });


  describe("Test Multisig wallet contract with 2 owners, 2 required for tx, daylimit 2 ether. use sendTransaction instead of execute()", function() {

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
          value: web3.toWei(web3.toBigNumber(5), "ether")
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
          assert.strictEqual(web3.toWei(5, "ether"), balances[0].toString(10), " 5 ether on multisig wallet");
          intialRecever1Balance = balances[1];
          return web3.eth.sendTransactionPromise({
            from: ownerA,
            to: aWalletInstance.address,
            data: "0xb61d27f6" + //== execute(address,uint256,bytes)
              "000000000000000000000000" + receiver1.substr(2) + //==address with 0x removed
              "0000000000000000000000000000000000000000000000000de0b6b3a7640000" + //== uint _value 1 ether
              "0000000000000000000000000000000000000000000000000000000000000060" + //== ?
              "0000000000000000000000000000000000000000000000000000000000000002" + //== ?
              //"87a2400000000000000000000000000000000000000000000000000000000000"
              "0000000000000000000000000000000000000000000000000000000000000000" //==bytes _data
              ,
            gas: amountGazProvided,
            gasPrice: 100000000000
          });
          /*  return aWalletInstance.execute(receiver1, web3.toWei(1, "ether"), "555556", {
              from: ownerA,
              gaz: amountGazProvided
            });*/
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent)
        })
        .then(txMined => {
          //            console.log("getTransactionReceiptMined");
          //            console.log(txMined);
          //            console.log(txMined.logs[1].data);
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          operationToConfirm = txMined.logs[1].data; // operation is at the begining so ok, it will be truncate and that's ok to not substring.
          return web3.eth.getTransactionReceipt(txMined.transactionHash);
        })
        .then(txReceipt => {
          //          console.log("txReceipt");
          //            console.log(txReceipt);
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
  });

  describe("Test Multisig wallet contract with 2 owners, 2 required for tx, daylimit 2 ether. test daily limit  with data length = 0 => KO => 3 ethers sent daily limit is 2 ethers", function() {

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
          value: web3.toWei(web3.toBigNumber(5), "ether")
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
          assert.strictEqual(web3.toWei(5, "ether"), balances[0].toString(10), " 5 ether on multisig wallet");
          intialRecever1Balance = balances[1];
          return web3.eth.sendTransactionPromise({
            from: ownerA,
            to: aWalletInstance.address,
            data: "0xb61d27f6" + //== execute(address,uint256,bytes)
              "000000000000000000000000" + receiver1.substr(2) + //==address with 0x removed
              //"0000000000000000000000000000000000000000000000000de0b6b3a7640000"+ //== uint _value 1 ether
              "00000000000000000000000000000000000000000000000029a2241af62c0000" + //==  uint _value 3 ethers

              "0000000000000000000000000000000000000000000000000000000000000060" //== ?
              //  "0000000000000000000000000000000000000000000000000000000000000002" //== ?
              //"87a2400000000000000000000000000000000000000000000000000000000000"
              //    "0000000000000000000000000000000000000000000000000000000000000000"  //==bytes _data = 0
              ,
            gas: amountGazProvided,
            gasPrice: 100000000000
          });
          /*  return aWalletInstance.execute(receiver1, web3.toWei(1, "ether"), "555556", {
              from: ownerA,
              gaz: amountGazProvided
            });*/
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent)
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          operationToConfirm = txMined.logs[1].data; // operation is at the begining so ok, it will be truncate and that's ok to not substring.
          return web3.eth.getTransactionReceipt(txMined.transactionHash);
        })
        .then(txReceipt => {
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
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(3, "ether")).toString(10), "receiver1 must not received 3 ether comming from the multisig wallet. Daily limit is 2");
        });
    });
  });


  describe("Test Multisig wallet contract with 2 owners owner A, owner B, 2 required for tx, daylimit 2 ethers. send to owner A. just to test this case (before REENTRANCY test ;) also). 2 required but just need for ownerA to convice ownerB for the deal", function() {

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

    it("creator send 1 ether to it, and then ownerA can send to him ownerA after owner B has confirmed", function() {
      var intialOwnerABalance;
      var operationToConfirm;
      //send 1 ether to it
      return web3.eth.sendTransactionPromise({
          from: creator,
          to: aWalletInstance.address,
          gas: amountGazProvided,
          value: web3.toWei(web3.toBigNumber(1), "ether")
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent);
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(aWalletInstance.address);
        })
        .then(balance => {
          assert.strictEqual(web3.toWei(1, "ether"), balance.toString(10), " 1 ether on multisig wallet");
          return aWalletInstance.execute(ownerA, web3.toWei(1, "ether"), "execute", {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.strictEqual(txMined.logs[1].event, "ConfirmationNeeded", "ConfirmationNeeded from ownerB");
          operationToConfirm = txMined.logs[1].args.operation;
          return web3.eth.getBalancePromise(ownerA);
        })
        .then(balance => {
          intialOwnerABalance = balance;
          return aWalletInstance.confirm(operationToConfirm, {
            from: ownerB,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(ownerA);
        })
        .then(balance => {
          assert.strictEqual(intialOwnerABalance.toString(10), balance.minus(web3.toWei(1, "ether")).toString(10), "ownerA must received 1 ether comming from the multisig wallet");
        });
    });
  });

  describe("REENTRANCY test :Test Multisig wallet contract with 2 owners owner A, owner B, 2 required for tx, daylimit 2 ethers. send to owner A.", function() {

    var aWalletInstance;
    var aWalletAttacker;
    beforeEach("create a new contract instance", function() {
      //Wallet(address[] _owners, uint _required, uint _daylimit)

      return WalletAttacker.new({
          from: ownerA,
          gas: amountGazProvided
        })
        .then(instance => {
          aWalletAttacker = instance;
          return aWalletAttacker.sendTransaction({
            from: ownerA,
            gas: amountGazProvided,
            value: web3.toWei(2, "ether") //init some ether to pay gas
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return Wallet.new([aWalletAttacker.address, ownerB], 2, web3.toWei(web3.toBigNumber(2), "ether"), {
            from: creator,
            gas: amountGazProvided
          });
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

    it("creator send 1 ether to it, and then ownerA can send to him ownerA after owner B has confirmed", function() {
      var operationToConfirm;
      //send 1 ether to it
      return web3.eth.sendTransactionPromise({
          from: creator,
          to: aWalletInstance.address,
          gas: amountGazProvided,
          value: web3.toWei(web3.toBigNumber(5), "ether")
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent);
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(aWalletInstance.address);
        })
        .then(balance => {
          assert.strictEqual(web3.toWei(5, "ether"), balance.toString(10), " 5 ethers on multisig wallet");
          return aWalletInstance.execute(aWalletAttacker.address, web3.toWei(1, "ether"), "execute", {
            from: ownerB,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.strictEqual(txMined.logs[1].event, "ConfirmationNeeded", "ConfirmationNeeded from ownerB");
          operationToConfirm = txMined.logs[1].args.operation;
          return aWalletAttacker.attack(aWalletInstance.address, {
            from: ownerA,
            gas: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return aWalletAttacker.confirm(operationToConfirm, {
            from: ownerA,
            gas: amountGazProvided
          });
          /*  return aWalletInstance.confirm(operationToConfirm, {
              from: ownerA,
              gaz: amountGazProvided
            });*/
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(aWalletInstance.address);
        })
        .then(balance => {
          assert.strictEqual(web3.toWei(4, "ether"), balance.toString(10), "4 ethers on multisig wallet=> reentrency ok GOOD");
        });
    });
  });

  describe("REENTRANCY Exemple on a modified vulnerable wallet WalletVulnerable FOR TEST ONLY :Test Multisig wallet contract with 2 owners owner A, owner B, 2 required for tx, daylimit 2 ethers. send to owner A.", function() {

    var aWalletInstance;
    var aWalletAttacker;
    beforeEach("create a new contract instance", function() {
      //Wallet(address[] _owners, uint _required, uint _daylimit)

      return WalletAttacker.new({
          from: ownerA,
          gas: amountGazProvided
        })
        .then(instance => {
          aWalletAttacker = instance;
          return aWalletAttacker.sendTransaction({
            from: ownerA,
            gas: amountGazProvided,
            value: web3.toWei(2, "ether") //init some ether to pay gas
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return WalletVulnerable.new([aWalletAttacker.address, ownerB], 2, web3.toWei(web3.toBigNumber(2), "ether"), {
            from: creator,
            gas: amountGazProvided
          });
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

    it("creator send 1 ether to it, and then ownerA can send to him ownerA after owner B has confirmed", function() {
      var operationToConfirm;
      //send 1 ether to it
      return web3.eth.sendTransactionPromise({
          from: creator,
          to: aWalletInstance.address,
          gas: amountGazProvided,
          value: web3.toWei(web3.toBigNumber(5), "ether")
        })
        .then(txSent => {
          return web3.eth.getTransactionReceiptMined(txSent);
        })
        .then(txMined => {
          assert.isBelow(txMined.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(aWalletInstance.address);
        })
        .then(balance => {
          assert.strictEqual(web3.toWei(5, "ether"), balance.toString(10), " 5 ethers on multisig wallet");
          return aWalletInstance.execute(aWalletAttacker.address, web3.toWei(1, "ether"), "execute", {
            from: ownerB,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.strictEqual(txMined.logs[1].event, "ConfirmationNeeded", "ConfirmationNeeded from ownerB");
          operationToConfirm = txMined.logs[1].args.operation;
          return aWalletAttacker.attack(aWalletInstance.address, {
            from: ownerA,
            gas: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return aWalletAttacker.confirm(operationToConfirm, {
            from: ownerA,
            gas: amountGazProvided
          });
          /*  return aWalletInstance.confirm(operationToConfirm, {
              from: ownerA,
              gaz: amountGazProvided
            });*/
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(aWalletInstance.address);
        })
        .then(balance => {
          assert.strictEqual(web3.toWei(3 /*instead of 4*/ , "ether"), balance.toString(10), "on a vulnerable contract modified explicitely FOR TEST ONLY. RECURSIVE CALL IN ACTION of confirm fonction => 3 ethers instead of 4 ethers expected on the multisig wallet. ");
        });
    });
  });


  describe("Daily Limit the usecase", function() {

    var aWalletInstance;

    beforeEach("create a new contract instance", function() {
      //Wallet(address[] _owners, uint _required, uint _daylimit)
      return Wallet.new([ownerA, ownerB], 2, web3.toWei(web3.toBigNumber(1), "ether"), {
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

    it("Daily Limit the usecase Test", function() {
      var intialRecever1Balance;
      //1 ) ownerA load the multisig wallet with 4 ethers
      //2 ) ownerA invoke execute to Send 2 ethers to receiver1.
      //3 ) ownerB confirm
      //4 ) receiver1  received 2 ethers from multisig confirmed by ownerA and ownerB
      //5 ) Daily Limit is not impacted by a multisig sent
      //5 ) ownerA invoke execute to Send 1 ether to receiver1.(without owner B confirm)
      //7 ) receiver1  received 1 ether. receiver1 has now 3 ethers
      //8 ) ownerA invoke execute to try to Send 1 ether to receiver1.(without owner B confirm)
      //9 ) receiver1 still have 3 ethers
      //10 ) The DailyLimit is 1 ether so nothing send
      //  =>DailyLimit works
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
          //2 ) ownerA invoke execute to Send 2 ethers to receiver1.
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
          //4 ) receiver1  received 2 ethers from multisig confirmed by ownerA and ownerB
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(2, "ether")).toString(10), "receiver1 must received 2 ethers comming from the multisig wallet");
          return Promise.all([
            aWalletInstance.m_dailyLimit.call(),
            aWalletInstance.m_spentToday.call()
          ]);
        })
        .then(daylimitfields => {
          [m_dailyLimit, m_spentToday] = daylimitfields;
          assert.strictEqual(web3.toWei(1, "ether").toString(10), m_dailyLimit.toString(10), "m_dailyLimit is 1 ether");
          //console.log(m_dailyLimit);
          assert.strictEqual(web3.toWei(0, "ether").toString(10), m_spentToday.toString(10), "When sent with Mulit sig : do not impact m_spentToday so it is 0 here !");
          //console.log(m_spentToday);
          //5 ) ownerA invoke execute to Send 1 ethers to receiver1.(without owner B confirm)
          return aWalletInstance.execute(receiver1, web3.toWei(1, "ether"), 0, {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(receiver1);
        })
        .then(balance => {
          //7 ) receiver1  received 1 ether. receiver1 has now 3 ethers
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(3, "ether")).toString(10), "we succed to send 3 ethers to receiver1");
          return Promise.all([
            aWalletInstance.m_dailyLimit.call(),
            aWalletInstance.m_spentToday.call()
          ]);
        })
        .then(daylimitfields => {
          [m_dailyLimit, m_spentToday] = daylimitfields;
          assert.strictEqual(web3.toWei(1, "ether").toString(10), m_dailyLimit.toString(10), "m_dailyLimit is 1 ether");
          //console.log(m_dailyLimit);
          assert.strictEqual(web3.toWei(1, "ether").toString(10), m_spentToday.toString(10), "m_dailyLimit is 1 ether ownerA can m_spentToday 1 ether");
          //console.log(m_spentToday);
          //8 ) ownerA invoke execute to try to Send 1 ether to receiver1.(without owner B confirm)
          return aWalletInstance.execute(receiver1, web3.toWei(1, "ether"), 0, {
              from: ownerA,
              gaz: amountGazProvided
            })
            .then(txMined => {
              assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
              return web3.eth.getBalancePromise(receiver1);
            })
            .then(balance => {
              //9 ) receiver1 still have 3 ethers
              assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(3, "ether")).toString(10), "must be still 3 ethers");
              return Promise.all([
                aWalletInstance.m_dailyLimit.call(),
                aWalletInstance.m_spentToday.call()
              ]);
            })
            .then(daylimitfields => {
              [m_dailyLimit, m_spentToday] = daylimitfields;
              //10 ) The DailyLimit is 1 ether so nothing send
              assert.strictEqual(web3.toWei(1, "ether").toString(10), m_dailyLimit.toString(10), "m_dailyLimit is 1 ether");
              //console.log(m_dailyLimit);
              assert.strictEqual(web3.toWei(1, "ether").toString(10), m_spentToday.toString(10), "m_spentToday still 1 ether. DayLimit works!");
              //console.log(m_spentToday);
            });
        });
    });
  });


  describe("Daily Limit the usecase, when DailyLimit set to 0", function() {

    var aWalletInstance;

    beforeEach("create a new contract instance", function() {
      //Wallet(address[] _owners, uint _required, uint _daylimit)
      return Wallet.new([ownerA, ownerB], 2, web3.toWei(web3.toBigNumber(0), "ether"), {
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

    it("Daily Limit the usecase, when DailyLimit set to 0", function() {
      var intialRecever1Balance;
      //1 ) ownerA load the multisig wallet with 4 ethers
      //2 ) ownerA invoke execute to Send 2 ethers to receiver1.
      //3 ) ownerB confirm
      //4 ) receiver1  received 2 ethers from multisig confirmed by ownerA and ownerB
      //5 ) Daily Limit is not impacted by a multisig sent
      //5 ) ownerA invoke execute to Send 1 ether to receiver1.(without owner B confirm)
      //6 ) receiver1 still have 2 ethers
      //7 ) The DailyLimit is 0 ether so nothing send
      //  =>DailyLimit works
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
          //2 ) ownerA invoke execute to Send 2 ethers to receiver1.
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
          //4 ) receiver1  received 2 ethers from multisig confirmed by ownerA and ownerB
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(2, "ether")).toString(10), "receiver1 must received 2 ethers comming from the multisig wallet");
          return Promise.all([
            aWalletInstance.m_dailyLimit.call(),
            aWalletInstance.m_spentToday.call()
          ]);
        })
        .then(daylimitfields => {
          [m_dailyLimit, m_spentToday] = daylimitfields;
          assert.strictEqual(web3.toWei(0, "ether").toString(10), m_dailyLimit.toString(10), "m_dailyLimit is 0 ether");
          //console.log(m_dailyLimit);
          assert.strictEqual(web3.toWei(0, "ether").toString(10), m_spentToday.toString(10), "When sent with Mulit sig : do not impact m_spentToday so it is 0 here !");
          //console.log(m_spentToday);
          //5 ) ownerA invoke execute to Send 1 ethers to receiver1.(without owner B confirm)
          return aWalletInstance.execute(receiver1, web3.toWei(1, "ether"), 0, {
            from: ownerA,
            gaz: amountGazProvided
          });
        })
        .then(txMined => {
          assert.isBelow(txMined.receipt.gasUsed, amountGazProvided, "should not use all gas");
          return web3.eth.getBalancePromise(receiver1);
        })
        .then(balance => {
          //6 ) receiver1 still have 2 ethers
          assert.strictEqual(intialRecever1Balance.toString(10), balance.minus(web3.toWei(2, "ether")).toString(10), "nothing sent because DailyLimit = 0");
          return Promise.all([
            aWalletInstance.m_dailyLimit.call(),
            aWalletInstance.m_spentToday.call()
          ]);
        })
        .then(daylimitfields => {
          [m_dailyLimit, m_spentToday] = daylimitfields;
          //7 ) The DailyLimit is 0 ether so nothing send
          assert.strictEqual(web3.toWei(0, "ether").toString(10), m_dailyLimit.toString(10), "m_dailyLimit is 0 ether");
          //console.log(m_dailyLimit);
          assert.strictEqual(web3.toWei(0, "ether").toString(10), m_spentToday.toString(10), "m_dailyLimit is 0 ether ownerA can't m_spentToday 1 ether");
          //console.log(m_spentToday);
        });
    });
  });
});
