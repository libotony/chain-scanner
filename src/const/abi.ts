// tslint:disable:max-line-length
import { abi } from 'thor-devkit'

const $MasterABI: abi.Event.Definition = { anonymous: false, inputs: [{ indexed: false, name: 'newMaster', type: 'address' }], name: '$Master', type: 'event' }
const TransferABI: abi.Event.Definition = { anonymous: false, inputs: [{ indexed: true, name: '_from', type: 'address' }, { indexed: true, name: '_to', type: 'address' }, { indexed: false, name: '_value', type: 'uint256' }], name: 'Transfer', type: 'event' }
const methodMasterABI: abi.Function.Definition = {constant: true, inputs: [{name: 'self', type: 'address'}], name: 'master', outputs: [{name: '', type: 'address'}], payable: false, stateMutability: 'view', type: 'function'}
const BalanceOfABI: abi.Function.Definition = {constant: true, inputs: [{name: '_owner', type: 'address'}], name: 'balanceOf', outputs: [{name: 'balance', type: 'uint256'}], payable: false, stateMutability: 'view', type: 'function'}
const totalSupplyABI: abi.Function.Definition = {constant: true, inputs: [], name: 'totalSupply', outputs: [{name: 'supply', type: 'uint256'}], payable: false, stateMutability: 'view', type: 'function'}
const firstABI: abi.Function.Definition = {constant: true, inputs: [], name: 'first', outputs: [{name: '', type: 'address'}], payable: false, stateMutability: 'view', type: 'function'}
const getABI: abi.Function.Definition = { constant: true, inputs: [{ name: '_nodeMaster', type: 'address' }], name: 'get', outputs: [{ name: 'listed', type: 'bool' }, { name: 'endorsor', type: 'address' }, { name: 'identity', type: 'bytes32' }, { name: 'active', type: 'bool' }], payable: false, stateMutability: 'view', type: 'function' }
const nextABI: abi.Function.Definition = {constant: true, inputs: [{name: '_nodeMaster', type: 'address'}], name: 'next', outputs: [{name: '', type: 'address'}], payable: false, stateMutability: 'view', type: 'function'}
const candidateABI: abi.Event.Definition = {anonymous: false, inputs: [{indexed: true, name: 'nodeMaster', type: 'address'}, {indexed: false, name: 'action', type: 'bytes32'}], name: 'Candidate', type: 'event'}

export const $Master = new abi.Event($MasterABI)
export const TransferEvent = new abi.Event(TransferABI)
export const methodMaster = new abi.Function(methodMasterABI)
export const balanceOf = new abi.Function(BalanceOfABI)
export const totalSupply = new abi.Function(totalSupplyABI)
export const authority = {
    first: new abi.Function(firstABI),
    get: new abi.Function(getABI),
    next: new abi.Function(nextABI),
    Candidate: new abi.Event(candidateABI),
    revoked: '0x' + Buffer.from('revoked').toString('hex').padEnd(64, '0'),
    added: '0x' + Buffer.from('added').toString('hex').padEnd(64, '0')
}
