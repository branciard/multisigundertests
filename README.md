# multisigundertests
test existing multisig contracts

test env :
Ubuntu 16.04.2 LTS
geth 1.6.5-stable-cf87713d
EthereumJS TestRPC v3.0.5
Truffle v3.4.5 (core: 3.4.5)

npm install

truffle compile
truffle test

tests results :

:~/multisigundertests$ truffle test
Using network 'development'.



   Contract: Wallet
    Test Multisig wallet contract with 2 owners, 1 required for tx, daylimit 2 ether
      ✓ Multisig wallet 0 balance after creation
      ✓ ownerA send 1 ether to it, and then ownerA can sent this ether to receiver1 (71ms)
      ✓ the dailyLimit is not active when 1 required. ok why not. dailyLimit is 2 but 4 is spent (236ms)
    Test Multisig wallet contract with 2 owners, 2 required for tx, daylimit 2 ethers
      ✓ Multisig wallet 0 balance after creation
      ✓ ownerA send 1 ether to it, and then ownerA can sent this ether to receiver1 after owner B has confirmed (338ms)
      ✓ DailyLimit do not work when we invoke execute fonction with _data length not equal to 0 (425ms)


  6 passing (2s)



