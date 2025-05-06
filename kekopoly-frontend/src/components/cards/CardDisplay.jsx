import { useState, useEffect } from 'react';
import { Box, Text, Flex, Image, Badge, Button, Heading, VStack, HStack } from '@chakra-ui/react';
import { useSelector, useDispatch } from 'react-redux';

/**
 * CardDisplay component
 * Displays a card when drawn or played
 */
const CardDisplay = ({ card = null, onClose = null }) => {
  // In a real implementation, we would get activeCard from Redux
  // const activeCard = useSelector(state => state.cards.activeCard);
  const activeCard = card;
  
  // Animation state
  const [isShowing, setIsShowing] = useState(false);

  // When a new card is shown, trigger animation
  useEffect(() => {
    if (activeCard) {
      setIsShowing(true);
    } else {
      setIsShowing(false);
    }
  }, [activeCard]);

  // Close the card (in real app would dispatch clearActiveCard)
  const handleClose = () => {
    setIsShowing(false);
    if (onClose) {
      onClose();
    }
  };

  // No card to display
  if (!activeCard) return null;

  // Get card type color
  const getCardTypeColor = (type) => {
    switch (type?.toLowerCase()) {
      case 'meme':
        return 'kekBlue.500';
      case 'redpill':
        return 'kekRed.500';
      case 'eegi':
        return 'green.500';
      default:
        return 'gray.500';
    }
  };

  // Get rarity style
  const getRarityStyle = (rarity) => {
    switch (rarity?.toLowerCase()) {
      case 'common':
        return {
          color: 'green.500',
          borderColor: 'green.200',
        };
      case 'rare':
        return {
          color: 'blue.500',
          borderColor: 'blue.200',
        };
      case 'legendary':
        return {
          color: 'orange.500',
          borderColor: 'orange.200',
        };
      default:
        return {
          color: 'gray.500',
          borderColor: 'gray.200',
        };
    }
  };

  const rarityStyle = getRarityStyle(activeCard.rarity);

  return (
    <Box 
      p={4} 
      borderWidth="1px" 
      borderRadius="lg" 
      overflow="hidden"
      bg="white"
      boxShadow="lg"
      position="relative"
      transform={isShowing ? "scale(1)" : "scale(0.8)"}
      opacity={isShowing ? 1 : 0}
      transition="all 0.3s ease-in-out"
      borderColor={getCardTypeColor(activeCard.cardType)}
      borderLeftWidth="5px"
    >
      <VStack spacing={3} align="stretch">
        {/* Card Header */}
        <Flex justify="space-between" align="center">
          <Heading size="md" color={getCardTypeColor(activeCard.cardType)}>
            {activeCard.name}
          </Heading>
          <Badge 
            variant="subtle" 
            colorScheme={activeCard.rarity?.toLowerCase() === 'legendary' ? "orange" : 
                         activeCard.rarity?.toLowerCase() === 'rare' ? "blue" : "green"}
          >
            {activeCard.rarity}
          </Badge>
        </Flex>
        
        {/* Card Type */}
        <Text color="gray.500" fontSize="sm">
          {activeCard.cardType} CARD
        </Text>
        
        {/* Card Image - Would be replaced with actual card images */}
        <Box 
          h="100px" 
          bg={getCardTypeColor(activeCard.cardType)}
          opacity="0.2"
          borderRadius="md"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="xl" fontWeight="bold" opacity="0.8" textAlign="center">
            {activeCard.cardType === 'MEME' ? '🐸' : 
             activeCard.cardType === 'REDPILL' ? '💊' : '🤖'}
          </Text>
        </Box>
        
        {/* Card Description */}
        <Box p={2} bg="gray.50" borderRadius="md">
          <Text>{activeCard.description || activeCard.effect || "No description available"}</Text>
        </Box>
        
        {/* Card Footer */}
        <Flex justify="flex-end">
          <Button size="sm" onClick={handleClose}>
            Close
          </Button>
        </Flex>
      </VStack>
    </Box>
  );
};

/**
 * CardsList component
 * Shows cards in player's hand
 */
export const CardsList = ({ cards = [], onCardClick }) => {
  if (!cards || cards.length === 0) {
    return (
      <Box p={4} textAlign="center" color="gray.500">
        No cards in hand
      </Box>
    );
  }

  return (
    <VStack spacing={2} align="stretch">
      <Heading size="sm" mb={2}>Your Cards</Heading>
      
      {cards.map((card) => (
        <Box 
          key={card.cardId} 
          p={2} 
          borderWidth="1px" 
          borderRadius="md" 
          cursor="pointer"
          onClick={() => onCardClick(card)}
          _hover={{ bg: 'gray.50' }}
          borderLeftWidth="3px"
          borderLeftColor={
            card.cardType === 'MEME' ? 'kekBlue.500' : 
            card.cardType === 'REDPILL' ? 'kekRed.500' : 'green.500'
          }
        >
          <Flex justify="space-between" align="center">
            <Text fontWeight="semibold">{card.name}</Text>
            <Badge 
              variant="subtle" 
              colorScheme={
                card.rarity === 'LEGENDARY' ? "orange" : 
                card.rarity === 'RARE' ? "blue" : "green"
              }
              fontSize="xs"
            >
              {card.rarity}
            </Badge>
          </Flex>
          <Text fontSize="xs" color="gray.500" mt={1}>
            {card.cardType} CARD
          </Text>
        </Box>
      ))}
    </VStack>
  );
};

export default CardDisplay;