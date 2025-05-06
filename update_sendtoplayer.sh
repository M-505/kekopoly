#!/bin/bash

# Update all SendToPlayer calls to use SendToPlayerWithPriority with appropriate priority
sed -i 's/c\.hub\.SendToPlayer(c\.gameID, c\.playerID, errorJSON)/c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, errorJSON, PriorityHigh)/g' kekopoly-backend/internal/game/websocket/hub.go
sed -i 's/c\.hub\.SendToPlayer(c\.gameID, c\.playerID, ackBytes)/c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, ackBytes, PriorityNormal)/g' kekopoly-backend/internal/game/websocket/hub.go
sed -i 's/c\.hub\.SendToPlayer(c\.gameID, c\.playerID, responseJSON)/c.hub.SendToPlayerWithPriority(c.gameID, c.playerID, responseJSON, PriorityNormal)/g' kekopoly-backend/internal/game/websocket/hub.go
sed -i 's/c\.hub\.SendToPlayer(gameID, c\.playerID, confirmationJSON)/c.hub.SendToPlayerWithPriority(gameID, c.playerID, confirmationJSON, PriorityNormal)/g' kekopoly-backend/internal/game/websocket/hub.go

echo "Updated all SendToPlayer calls to use SendToPlayerWithPriority"
