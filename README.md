# Chain Scanner

Scan the DB and transform interested data into a relational DB.

## Workflow

```
+----------------+       +-----------------+        +----------------+
|                |       |                 |        |                |
|   Thor Node    +------>+  Foundation DB  +------->+ Defined Entity |
|                |       |                 |        |                |
+----------------+       +-----------------+        +----------------+
```
+ `Foundation DB`: Blocks/TXs/Receipts
+ `Defined Entity`: Balances/Transfers/Authority Master Nodes etc

## Features

+ Blocks/TXs/Receipts
+ VET/VTHO Balance and Transfer
+ VIP180 Token Balance and Transfer
+ MasterNode behavior
