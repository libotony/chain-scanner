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
    Authority,
    VIP180Token = 100
}

export enum AssetType {
    VET = 0,
    Energy,
    PLA,
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

export interface MovementIndex {
    txIndex: number
    clauseIndex: number
    logIndex: number
}
