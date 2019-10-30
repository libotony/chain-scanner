export interface BlockSummary {
    id: string
    number: number
    timestamp: number
    parentID: string
}

export interface Fork {
    ancestor: BlockSummary
    trunk: BlockSummary[]
    branch: BlockSummary[]
}

export interface Event {
    address: string
    topics: string[]
    data: string
}

export interface Transfer {
    sender: string
    recipient: string
    amount: string
}

export interface Output {
    contractAddress: string | null,
    events: Event[],
    transfers: Transfer[]
}

export interface Clause {
    to: string | null
    value: string | number
    data: string
}

export enum SnapType {
    DualToken = 0,
    VIP180Token = 100
}

export interface TokenBasic {
    name: string
    address: string
    symbol: string
    decimals: number,
}

export enum TokenType {
    PLA = 0,
    SHA,
    EHrT,
    DBET,
    TIC,
    OCE,
    SNK,
    JUR,
    AQD,
    YEET
}
