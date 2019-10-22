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
