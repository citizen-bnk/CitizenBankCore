import test from 'node:test';
import assert from 'node:assert/strict';
import {CUSTOMER_PRODUCTS,CUSTOMER_TEST_CREDIT_CENTS,customerDefaultPermissions,shouldCreateVirtualCard} from '../lib/customer-products-policy';
test('customers get all three fictional products and a fixed once-only M5000 offer',()=>{
 assert.deepEqual(CUSTOMER_PRODUCTS,['CURRENT','SAVINGS','CRYPTO']);assert.equal(CUSTOMER_TEST_CREDIT_CENTS,500000);
 assert.deepEqual(customerDefaultPermissions(['CUSTOMER']),{accounts:true,cards:true,energize:true});
 assert.deepEqual(customerDefaultPermissions(['BOARD_MEMBER']),{accounts:false,cards:false,energize:false});
});
test('automatic virtual cards respect existing cards and the one-form rule',()=>{
 assert.equal(shouldCreateVirtualCard([]),true);
 assert.equal(shouldCreateVirtualCard([{form:'VIRTUAL',archivedAt:null}]),false);
 assert.equal(shouldCreateVirtualCard([{form:'PHYSICAL',archivedAt:null}]),false);
 assert.equal(shouldCreateVirtualCard([{form:'PHYSICAL',archivedAt:null}],true),true);
 assert.equal(shouldCreateVirtualCard([{form:'VIRTUAL',archivedAt:new Date()}]),true);
});
