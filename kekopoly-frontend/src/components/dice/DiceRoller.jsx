import { useState, useEffect } from 'react';
import { Box, Button, Flex, Text, HStack, useDisclosure, Alert, AlertIcon } from '@chakra-ui/react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton
} from "@chakra-ui/react";
import { useSelector, useDispatch } from 'react-redux';
import { motion } from "framer-motion";

// Dice face configurations
const diceFaces = [
  [{ position: 'center', value: 1 }],
  [{ position: 'top-left', value: 1 }, { position: 'bottom-right', value: 1 }],
  [{ position: 'top-left', value: 1 }, { position: 'center', value: 1 }, { position: 'bottom-right', value: 1 }],
  [{ position: 'top-left', value: 1 }, { position: 'top-right', value: 1 }, { position: 'bottom-left', value: 1 }, { position: 'bottom-right', value: 1 }],
  [{ position: 'top-left', value: 1 }, { position: 'top-right', value: 1 }, { position: 'center', value: 1 }, { position: 'bottom-left', value: 1 }, { position: 'bottom-right', value: 1 }],
  [{ position: 'top-left', value: 1 }, { position: 'top-right', value: 1 }, { position: 'middle-left', value: 1 }, { position: 'middle-right', value: 1 }, { position: 'bottom-left', value: 1 }, { position: 'bottom-right', value: 1 }],
];

/**
 * Single die component that shows one of six faces
 */
const Die = ({ value, isRolling }) => {
  // Get the dot positions for the current value
  const dots = diceFaces[value - 1] || diceFaces[0];

  return (
    <motion.div
      animate={{
        rotateX: isRolling ? [0, 360] : 0,
        rotateY: isRolling ? [0, 360] : 0,
      }}
      transition={{
        duration: 0.6,
        repeat: isRolling ? Infinity : 0,
        ease: "easeInOut"
      }}
    >
      <Box
        width="60px"
        height="60px"
        bg="white"
        borderRadius="md"
        boxShadow="md"
        position="relative"
        display="flex"
        justifyContent="center"
        alignItems="center"
        border="1px solid"
        borderColor="gray.200"
      >
        {dots.map((dot, index) => (
          <Box
            key={index}
            position="absolute"
            width="12px"
            height="12px"
            borderRadius="full"
            bg="#333"
            {...getDotPosition(dot.position)}
          />
        ))}
      </Box>
    </motion.div>
  );
};

/**
 * Helper function to get the CSS position for each dot
 */
const getDotPosition = (position) => {
  switch (position) {
    case 'top-left':
      return { top: '10px', left: '10px' };
    case 'top-right':
      return { top: '10px', right: '10px' };
    case 'middle-left':
      return { top: '24px', left: '10px' };
    case 'center':
      return { top: '24px', left: '24px' };
    case 'middle-right':
      return { top: '24px', right: '10px' };
    case 'bottom-left':
      return { bottom: '10px', left: '10px' };
    case 'bottom-right':
      return { bottom: '10px', right: '10px' };
    default:
      return { top: '24px', left: '24px' };
  }
};

/**
 * DiceRoller component
 * Shows two dice and handles rolling logic
 */
const DiceRoller = ({ isCurrentTurn = true, onRoll, onGoToJail }) => {
  const dispatch = useDispatch();
  
  // In a real implementation, we would get these from Redux
  // const diceValues = useSelector(state => state.game.diceValues);
  // const isRolling = useSelector(state => state.game.isRolling);
  
  // For demo purposes
  const [diceValues, setDiceValues] = useState([1, 1]);
  const [isRolling, setIsRolling] = useState(false);
  const [rollHistory, setRollHistory] = useState([]);
  const [consecutiveDoubles, setConsecutiveDoubles] = useState(0);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Handle roll button click
  const handleRoll = () => {
    if (!isCurrentTurn || isRolling) return;
    
    setIsRolling(true);
    
    // In a real application, we'd dispatch an action to roll the dice via socket
    // dispatch(rollDice());
    
    // For demo purposes, simulate a dice roll locally
    setTimeout(() => {
      const die1 = Math.floor(Math.random() * 6) + 1;
      const die2 = Math.floor(Math.random() * 6) + 1;
      const isDoubles = die1 === die2;
      
      setDiceValues([die1, die2]);
      
      // Update consecutive doubles count
      if (isDoubles) {
        setConsecutiveDoubles(prev => prev + 1);
      } else {
        setConsecutiveDoubles(0);
      }
      
      // Check for three consecutive doubles
      if (consecutiveDoubles === 2 && isDoubles) {
        setConsecutiveDoubles(0);
        if (onGoToJail) {
          onGoToJail();
        }
      }
      
      setRollHistory(prev => [
        { roll: [die1, die2], sum: die1 + die2, isDoubles },
        ...prev.slice(0, 4) // Keep only the 5 most recent rolls
      ]);
      setIsRolling(false);
      
      // Call the onRoll callback with the dice values
      if (onRoll) {
        onRoll(die1, die2, isDoubles);
      }
    }, 1000);
  };

  // Show roll history
  const showHistory = () => {
    onOpen();
  };

  return (
    <Box p={4} bg="brand.50" borderRadius="md" boxShadow="sm">
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontWeight="bold">Dice</Text>
        {rollHistory.length > 0 && (
          <Text 
            fontSize="sm" 
            color="blue.500" 
            cursor="pointer" 
            onClick={showHistory}
            _hover={{ textDecoration: 'underline' }}
          >
            Roll History
          </Text>
        )}
      </Flex>
      
      <Flex justify="center" mb={4}>
        <HStack spacing={4}>
          <Die value={diceValues[0]} isRolling={isRolling} />
          <Die value={diceValues[1]} isRolling={isRolling} />
        </HStack>
      </Flex>
      
      {!isRolling && diceValues[0] === diceValues[1] && (
        <Alert status="success" mb={2} borderRadius="md">
          <AlertIcon />
          <Text fontWeight="bold">DOUBLES! {consecutiveDoubles > 0 && `(${consecutiveDoubles} consecutive)`}</Text>
        </Alert>
      )}
      
      <Text textAlign="center" mb={4}>
        {isRolling ? 'Rolling...' : `Roll: ${diceValues[0] + diceValues[1]}`}
      </Text>
      
      <Button 
        colorScheme="teal"
        isDisabled={!isCurrentTurn || isRolling}
        onClick={handleRoll}
        width="100%"
      >
        {isRolling ? 'Rolling...' : 'Roll Dice'}
      </Button>
      
      {/* Roll History Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Roll History</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {rollHistory.length > 0 ? (
              rollHistory.map((roll, index) => (
                <Flex 
                  key={index} 
                  justify="space-between" 
                  p={2} 
                  borderBottom={index < rollHistory.length - 1 ? '1px solid' : 'none'}
                  borderColor="gray.100"
                >
                  <Text>Roll {rollHistory.length - index}:</Text>
                  <HStack>
                    <Text>{roll.roll[0]} + {roll.roll[1]} = {roll.sum}</Text>
                    {roll.isDoubles && (
                      <Text color="green.500" fontWeight="bold">DOUBLES!</Text>
                    )}
                  </HStack>
                </Flex>
              ))
            ) : (
              <Text>No rolls yet</Text>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default DiceRoller;