// tslint:disable:max-line-length
import { abi } from 'thor-devkit'

const $MasterABI: abi.Event.Definition = { anonymous: false, inputs: [{ indexed: false, name: 'newMaster', type: 'address' }], name: '$Master', type: 'event' }
const TransferABI: abi.Event.Definition = { anonymous: false, inputs: [{ indexed: true, name: '_from', type: 'address' }, { indexed: true, name: '_to', type: 'address' }, { indexed: false, name: '_value', type: 'uint256' }], name: 'Transfer', type: 'event' }

export const $Master = new abi.Event($MasterABI)
export const TransferEvent = new abi.Event(TransferABI)
