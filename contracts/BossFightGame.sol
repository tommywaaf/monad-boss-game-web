// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Version: Fixed randomness - use full hash value instead of bit extraction for uniform distribution

/// @notice Prototype, NOT production-secure randomness.
/// Good enough for testing and playing with Fireblocks / MetaMask, etc.
contract BossFightGame {
    // -------------------------
    // Types & storage
    // -------------------------

    struct Item {
        uint8 tier;      // 0..9
        uint256 id;      // unique id
    }

    struct TradeOffer {
        address from;
        address to;
        uint256 fromItemId;
        uint256 toItemId;
        bool executed;
    }

    uint256 public constant MAX_INVENTORY = 20;
    uint256 public nextItemId = 1;
    uint256 public nextTradeId = 1;
    uint256 public totalBossesKilled = 0;  // Global counter
    address payable public constant RAKE_ADDRESS = payable(0xf479caDb2f3324529aeB1061eBC0f845Fa9cBb17);
    uint256 public constant RAKE_FEE = 0.01 ether;

    mapping(address => Item[]) public inventory;         // per-player items
    mapping(uint256 => address) public itemOwner;        // itemId -> owner
    mapping(uint256 => TradeOffer) public trades;        // tradeId -> offer

    // per-player nonce to make randomness harder to game
    mapping(address => uint256) public killNonce;
    
    // Player tracking for leaderboard
    address[] public players;
    mapping(address => bool) public hasPlayed;
    mapping(address => uint256) public playerBossKills;

    // Base boss success: 75% = 7500 bps
    uint16 public constant BASE_SUCCESS_BPS = 7500;
    // Max success chance cap: 99% = 9900 bps
    uint16 public constant MAX_SUCCESS_BPS = 9900;

    // Lookup tables for rarity & success boosts per tier (basis points)
    uint16[10] public rarityBoostBps = [
        0,      // tier 0: Common
        100,    // tier 1: Grey  (+1%)
        200,    // tier 2: White (+2%)
        300,    // tier 3: Blue  (+3%)
        400,    // tier 4: Purple (+4%)
        500,    // tier 5: Orange (+5%)
        1000,   // tier 6: Red   (+10%)
        1500,   // tier 7: Brown (+15%)
        2000,   // tier 8: Black (+20%)
        2500    // tier 9: Rainbow (+25%)
    ];

    uint16[10] public successBoostBps = [
        500,   // tier 0: Common  +5%
        500,   // tier 1: Grey    +5%
        500,   // tier 2: White   +5%
        700,   // tier 3: Blue    +7%
        1000,  // tier 4: Purple  +10%
        1000,  // tier 5: Orange  +10%
        1000,  // tier 6: Red     +10%
        1000,  // tier 7: Brown   +10%
        1000,  // tier 8: Black   +10%
        1000   // tier 9: Rainbow +10%
    ];

    // Updated: removed 'upgraded' flag since rarity boost now scales the roll directly
    event BossKilled(address indexed player, uint8 tier, uint256 itemId, uint256 baseRoll, uint256 adjustedRoll, uint16 rarityBoost);
    event RakePaid(address indexed player, uint256 amount);
    // Debug event to see randomness inputs
    event RandomnessDebug(bytes32 blockhashValue, uint256 timestamp, address player, uint256 nonce, uint256 rawHash, uint256 baseRoll);
    event TradeProposed(uint256 tradeId, address indexed from, address indexed to, uint256 fromItemId, uint256 toItemId);
    event TradeExecuted(uint256 tradeId);
    event TradeCancelled(uint256 tradeId);
    event ItemTransferred(address indexed from, address indexed to, uint256 itemId, uint8 tier);

    // -------------------------
    // Public view helpers
    // -------------------------

    function getInventory(address player) external view returns (Item[] memory) {
        return inventory[player];
    }

    function getTotalBoosts(address player) public view returns (uint16 rarityBpsTotal, uint16 successBpsTotal) {
        Item[] storage items = inventory[player];
        for (uint256 i = 0; i < items.length; i++) {
            uint8 tier = items[i].tier;
            rarityBpsTotal += rarityBoostBps[tier];
            successBpsTotal += successBoostBps[tier];
        }
    }
    
    // Get total number of players
    function getPlayerCount() external view returns (uint256) {
        return players.length;
    }
    
    // Get player address by index (for iteration)
    function getPlayerAt(uint256 index) external view returns (address) {
        require(index < players.length, "Index out of bounds");
        return players[index];
    }
    
    // Get leaderboard data for a specific player
    function getPlayerStats(address player) external view returns (
        uint16 rarityBoost,
        uint16 successBoost,
        uint256 bossKills,
        uint256 inventorySize
    ) {
        (rarityBoost, successBoost) = getTotalBoosts(player);
        bossKills = playerBossKills[player];
        inventorySize = inventory[player].length;
    }

    // -------------------------
    // Core game: killBoss
    // -------------------------

    function killBoss() external payable {
        require(msg.value >= RAKE_FEE, "Rake fee required");
        (bool sent, ) = RAKE_ADDRESS.call{value: RAKE_FEE}("");
        require(sent, "Rake transfer failed");
        uint256 refund = msg.value - RAKE_FEE;
        if (refund > 0) {
            (bool refundSent, ) = payable(msg.sender).call{value: refund}("");
            require(refundSent, "Refund failed");
        }
        emit RakePaid(msg.sender, RAKE_FEE);

        address player = msg.sender;

        uint256 nonce = ++killNonce[player];

        // Boss always killed! Increment counters and track player
        totalBossesKilled++;
        playerBossKills[player]++;
        
        if (!hasPlayed[player]) {
            hasPlayed[player] = true;
            players.push(player);
        }

        // Determine item tier using independent random words
        uint256 baseWord = _randomWord(bytes32("BASE"), player, nonce);
        uint256 baseRoll = baseWord % 1_000_000_000;
        
        // Apply rarity boost by scaling down the roll
        // Higher rarity boost = lower adjusted roll = better chance at rare tiers
        (uint16 rarityBoostTotal, ) = getTotalBoosts(player);
        uint256 adjustedRoll = baseRoll;
        if (rarityBoostTotal > 0) {
            // Scale factor: 10000 = 100%, so 2500 boost means multiply by 75%
            uint256 scaleFactor = 10000 - rarityBoostTotal;
            if (scaleFactor < 1000) scaleFactor = 1000; // Cap at 90% reduction max
            adjustedRoll = (baseRoll * scaleFactor) / 10000;
        }
        
        uint8 finalTier = _rollBaseTier(adjustedRoll);
        
        // Emit debug info to see what's happening with randomness
        emit RandomnessDebug(
            blockhash(block.number - 1),
            block.timestamp,
            player,
            nonce,
            baseWord,
            adjustedRoll  // Show the adjusted roll that determines tier
        );

        // Mint the item internally and add to inventory (with auto-replace)
        uint256 itemId = nextItemId++;
        _giveItem(player, finalTier, itemId);

        emit BossKilled(player, finalTier, itemId, baseRoll, adjustedRoll, rarityBoostTotal);
    }

    // -------------------------
    // Internal helpers
    // -------------------------

    function _randomWord(bytes32 tag, address player, uint256 nonce) internal view returns (uint256) {
        // Ultra-simple randomness using ONLY guaranteed-to-work values
        // These 4 values MUST work on any EVM chain:
        // - blockhash: previous block's hash (guaranteed for block.number - 1)
        // - block.timestamp: current block timestamp
        // - player: the player's address
        // - nonce: incrementing counter per player
        //
        // keccak256 produces uniform 256-bit output regardless of input entropy
        return uint256(keccak256(abi.encodePacked(
            tag,
            blockhash(block.number - 1),
            block.timestamp,
            player,
            nonce
        )));
    }

    // Uses your 1:10, 1:100, ... table, approximated.
    // We do a sequence of checks from rarest to common:
    // If none of the rare ones hit, we fall back to tier 0 (Common).
    function _rollBaseTier(uint256 baseRoll) internal pure returns (uint8) {
        // baseRoll is already in range 0..999,999,999 from caller
        // Check from rarest to more common to keep probabilities very low
        if (baseRoll < 1) return 9;                 // ~1 in 1,000,000,000 Rainbow
        if (baseRoll < 10) return 8;                // ~1:100,000,000 Black (9 values: 1-9)
        if (baseRoll < 100) return 7;               // ~1:10,000,000 Brown (90 values: 10-99)
        if (baseRoll < 1_000) return 6;             // ~1:1,000,000 Red (900 values: 100-999)
        if (baseRoll < 10_000) return 5;           // ~1:100,000 Orange (9,000 values: 1,000-9,999)
        if (baseRoll < 100_000) return 4;           // ~1:10,000 Purple (90,000 values: 10,000-99,999)
        if (baseRoll < 1_000_000) return 3;         // ~1:1,000 Blue (900,000 values: 100,000-999,999)
        if (baseRoll < 10_000_000) return 2;        // ~1:100 White (9,000,000 values: 1,000,000-9,999,999)
        if (baseRoll < 100_000_000) return 1;       // ~1:10 Grey (90,000,000 values: 10,000,000-99,999,999)

        // Catch-all common (900,000,000 values: 100,000,000-999,999,999)
        return 0;
    }

    // Rarity boost now applied directly to roll in killBoss() - scales down the roll
    // to increase odds for ALL tiers, not just upgrade by 1

    function _giveItem(address player, uint8 tier, uint256 itemId) internal {
        require(tier <= 9, "Invalid tier");

        Item[] storage items = inventory[player];
        Item memory newItem = Item({tier: tier, id: itemId});

        if (items.length < MAX_INVENTORY) {
            items.push(newItem);
            itemOwner[itemId] = player;
            return;
        }

        // Inventory full: find weakest item
        uint256 weakestIndex = 0;
        uint8 weakestTier = items[0].tier;

        for (uint256 i = 1; i < items.length; i++) {
            if (items[i].tier < weakestTier) {
                weakestTier = items[i].tier;
                weakestIndex = i;
            }
        }

        // Only replace if new item is strictly better tier
        if (tier > weakestTier) {
            // remove ownership of old item
            itemOwner[items[weakestIndex].id] = address(0);
            // replace
            items[weakestIndex] = newItem;
            itemOwner[itemId] = player;
        }
        // else: discard new item
    }

    // -------------------------
    // Trading
    // -------------------------

    // Propose a 1:1 trade: your item for their item
    function proposeTrade(address to, uint256 myItemId, uint256 theirItemId) external returns (uint256 tradeId) {
        require(itemOwner[myItemId] == msg.sender, "You don't own that item");
        require(itemOwner[theirItemId] == to, "Counterparty doesn't own that item");

        tradeId = nextTradeId++;
        trades[tradeId] = TradeOffer({
            from: msg.sender,
            to: to,
            fromItemId: myItemId,
            toItemId: theirItemId,
            executed: false
        });

        emit TradeProposed(tradeId, msg.sender, to, myItemId, theirItemId);
    }

    // Accept a trade (must be called by the "to" address)
    function acceptTrade(uint256 tradeId) external {
        TradeOffer storage t = trades[tradeId];
        require(!t.executed, "Trade already executed");
        require(t.to == msg.sender, "Not your trade");

        // Ensure ownership hasn't changed
        require(itemOwner[t.fromItemId] == t.from, "From no longer owns item");
        require(itemOwner[t.toItemId] == t.to, "To no longer owns item");

        // Swap items in inventories
        _swapItems(t.from, t.to, t.fromItemId, t.toItemId);

        t.executed = true;
        emit TradeExecuted(tradeId);
    }

    function cancelTrade(uint256 tradeId) external {
        TradeOffer storage t = trades[tradeId];
        require(!t.executed, "Trade already executed");
        require(t.from == msg.sender, "Only maker can cancel");

        delete trades[tradeId];
        emit TradeCancelled(tradeId);
    }

    // Direct transfer of item to another address
    function transferItem(address to, uint256 itemId) external {
        require(to != address(0), "Cannot transfer to zero address");
        require(to != msg.sender, "Cannot transfer to yourself");
        require(itemOwner[itemId] == msg.sender, "You don't own this item");

        Item[] storage fromInv = inventory[msg.sender];
        Item[] storage toInv = inventory[to];

        // Find item in sender's inventory
        uint256 itemIndex = _findItemIndex(fromInv, itemId);
        Item memory item = fromInv[itemIndex];

        // Remove from sender
        fromInv[itemIndex] = fromInv[fromInv.length - 1];
        fromInv.pop();

        // Add to receiver (preserving item ID and tier)
        if (toInv.length < MAX_INVENTORY) {
            toInv.push(item);
        } else {
            // Receiver has full inventory - find weakest item
            uint256 weakestIndex = 0;
            uint8 weakestTier = toInv[0].tier;
            
            for (uint256 i = 1; i < toInv.length; i++) {
                if (toInv[i].tier < weakestTier) {
                    weakestTier = toInv[i].tier;
                    weakestIndex = i;
                }
            }
            
            // Only add if better than weakest
            if (item.tier > weakestTier) {
                // Remove ownership of replaced item
                itemOwner[toInv[weakestIndex].id] = address(0);
                // Replace with transferred item
                toInv[weakestIndex] = item;
            } else {
                // Item not good enough, return to sender
                fromInv.push(item);
                revert("Receiver's inventory full and item not strong enough");
            }
        }

        // Update ownership
        itemOwner[itemId] = to;

        emit ItemTransferred(msg.sender, to, itemId, item.tier);
    }

    function _swapItems(address a, address b, uint256 itemAId, uint256 itemBId) internal {
        Item[] storage invA = inventory[a];
        Item[] storage invB = inventory[b];

        uint256 indexA = _findItemIndex(invA, itemAId);
        uint256 indexB = _findItemIndex(invB, itemBId);

        // swap in arrays safely
        Item memory temp = invA[indexA];
        invA[indexA] = invB[indexB];
        invB[indexB] = temp;

        // update owners
        itemOwner[itemAId] = b;
        itemOwner[itemBId] = a;
    }

    function _findItemIndex(Item[] storage items, uint256 itemId) internal view returns (uint256) {
        for (uint256 i = 0; i < items.length; i++) {
            if (items[i].id == itemId) {
                return i;
            }
        }
        revert("Item not in inventory");
    }
}

