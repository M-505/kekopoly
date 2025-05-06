import { useState } from 'react';
import { Box, Button, Text, Heading, VStack, HStack, Flex, Badge, IconButton, useDisclosure, Progress, Icon, Tooltip } from '@chakra-ui/react';
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

/**
 * PropertyManagement component
 * Allows players to manage their properties - add engagements, add blue checkmarks, mortgage, etc.
 */
const PropertyManagement = ({ properties = [], onManageProperty }) => {
  const [selectedProperty, setSelectedProperty] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Group properties by color group
  const groupedProperties = properties.reduce((groups, property) => {
    if (!groups[property.group]) {
      groups[property.group] = [];
    }
    groups[property.group].push(property);
    return groups;
  }, {});

  // Handle property click
  const handlePropertyClick = (property) => {
    setSelectedProperty(property);
    onOpen();
    
    if (onManageProperty) {
      onManageProperty(property);
    }
  };

  // Format property types
  const formatPropertyType = (type) => {
    switch (type) {
      case 'REGULAR':
        return 'Property';
      case 'TRANSIT':
        return 'Transit';
      case 'UTILITY':
        return 'Utility';
      case 'SPECIAL':
        return 'Special';
      default:
        return type;
    }
  };

  // Color mapping for property groups
  const colorMapping = {
    'brown': 'brown.500',
    'light-blue': 'blue.300',
    'pink': 'pink.400',
    'orange': 'orange.400',
    'red': 'red.500',
    'yellow': 'yellow.400',
    'green': 'green.500',
    'blue': 'blue.600',
    'transit': 'gray.500',
    'utility': 'purple.400',
  };

  // Calculate whether player has a complete color group
  const hasCompleteGroup = (group, properties) => {
    // This would need real game logic for the actual number of properties in each group
    const requiredCounts = {
      'brown': 2,
      'light-blue': 3,
      'pink': 3,
      'orange': 3,
      'red': 3,
      'yellow': 3,
      'green': 3,
      'blue': 2,
      'transit': 4,
      'utility': 2,
    };
    
    return properties.length >= (requiredCounts[group] || 1);
  };

  // Render property list grouped by color
  const renderPropertyList = () => {
    return Object.entries(groupedProperties).map(([group, groupProps]) => (
      <Box key={group} mb={4}>
        <Flex align="center" mb={2}>
          <Box 
            w="12px" 
            h="12px" 
            borderRadius="full" 
            bg={colorMapping[group] || 'gray.400'} 
            mr={2} 
          />
          <Text fontWeight="bold" fontSize="sm">
            {group.charAt(0).toUpperCase() + group.slice(1)}
            {hasCompleteGroup(group, groupProps) && (
              <Badge ml={2} colorScheme="green" fontSize="xs">Complete</Badge>
            )}
          </Text>
        </Flex>
        
        {groupProps.map(property => (
          <Box 
            key={property.propertyId}
            p={2} 
            mb={2}
            bg="white"
            borderRadius="md"
            boxShadow="sm"
            borderLeft="4px solid"
            borderColor={colorMapping[group] || 'gray.400'}
            onClick={() => handlePropertyClick(property)}
            cursor="pointer"
            _hover={{ bg: 'gray.50' }}
          >
            <Flex justify="space-between" align="center">
              <Text fontWeight="medium">{property.name}</Text>
              <Badge variant="subtle" colorScheme={property.mortgaged ? 'red' : 'green'}>
                {property.mortgaged ? 'Mortgaged' : formatPropertyType(property.type)}
              </Badge>
            </Flex>
            
            <Flex justify="space-between" mt={1}>
              <Text fontSize="sm">Rent: {property.rentCurrent} K</Text>
              <HStack spacing={1}>
                {/* Show engagements as green dots */}
                {Array(property.engagements || 0).fill().map((_, i) => (
                  <Box 
                    key={i} 
                    w="8px" 
                    h="8px" 
                    borderRadius="full" 
                    bg="green.400" 
                  />
                ))}
                
                {/* Show blue checkmark if property has one */}
                {property.blueCheckmark && (
                  <Box 
                    w="12px" 
                    h="12px" 
                    borderRadius="full" 
                    bg="blue.400" 
                    fontSize="8px"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    color="white"
                  >
                    ✓
                  </Box>
                )}
              </HStack>
            </Flex>
            
            {/* Show special effects if any */}
            {property.specialEffects && property.specialEffects.length > 0 && (
              <Text fontSize="xs" color="purple.600" mt={1}>
                🔮 Special Effect Active
              </Text>
            )}
          </Box>
        ))}
      </Box>
    ));
  };

  // Property management modal for selected property
  const renderPropertyModal = () => {
    if (!selectedProperty) return null;
    
    // Check if can add engagement (must have complete color group)
    const canAddEngagement = hasCompleteGroup(
      selectedProperty.group, 
      groupedProperties[selectedProperty.group] || []
    ) && !selectedProperty.mortgaged;
    
    // Check if can add blue checkmark (must have max engagements)
    const canAddBlueCheckmark = selectedProperty.engagements >= 4 && !selectedProperty.blueCheckmark && !selectedProperty.mortgaged;
    
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader
            borderLeftWidth="8px"
            borderLeftColor={colorMapping[selectedProperty.group] || 'gray.400'}
            pb={2}
          >
            {selectedProperty.name}
          </ModalHeader>
          <ModalCloseButton />
          
          <ModalBody>
            <VStack spacing={4} align="stretch">
              {/* Property details */}
              <HStack justify="space-between">
                <Text>Type:</Text>
                <Badge>{formatPropertyType(selectedProperty.type)}</Badge>
              </HStack>
              
              <HStack justify="space-between">
                <Text>Group:</Text>
                <Flex align="center">
                  <Box 
                    w="12px" 
                    h="12px" 
                    borderRadius="full" 
                    bg={colorMapping[selectedProperty.group] || 'gray.400'} 
                    mr={2} 
                  />
                  <Text>{selectedProperty.group.charAt(0).toUpperCase() + selectedProperty.group.slice(1)}</Text>
                </Flex>
              </HStack>
              
              <HStack justify="space-between">
                <Text>Value:</Text>
                <Text fontWeight="bold">{selectedProperty.price} K</Text>
              </HStack>
              
              <HStack justify="space-between">
                <Text>Current Rent:</Text>
                <Text fontWeight="bold" color="green.500">{selectedProperty.rentCurrent} K</Text>
              </HStack>
              
              <HStack justify="space-between">
                <Text>Mortgage Value:</Text>
                <Text>{Math.floor(selectedProperty.price / 2)} K</Text>
              </HStack>
              
              <Box my={3} height="1px" bg="gray.200" />
              
              {/* Engagements */}
              <Box>
                <Flex justify="space-between" align="center" mb={1}>
                  <Text fontWeight="bold">Engagements:</Text>
                  <Text>{selectedProperty.engagements}/4</Text>
                </Flex>
                <Progress 
                  value={selectedProperty.engagements * 25} 
                  colorScheme="green" 
                  size="sm" 
                  borderRadius="md" 
                />
              </Box>
              
              {/* Blue Checkmark */}
              <HStack justify="space-between">
                <Text fontWeight="bold">Blue Checkmark:</Text>
                <Badge colorScheme={selectedProperty.blueCheckmark ? "blue" : "gray"}>
                  {selectedProperty.blueCheckmark ? "Yes" : "No"}
                </Badge>
              </HStack>
              
              {/* Special Effects */}
              {selectedProperty.specialEffects && selectedProperty.specialEffects.length > 0 && (
                <Box>
                  <Text fontWeight="bold" mb={1}>Active Effects:</Text>
                  {selectedProperty.specialEffects.map((effect, index) => (
                    <Flex key={index} justify="space-between" bg="purple.50" p={2} borderRadius="md">
                      <Text fontSize="sm">{effect.type}</Text>
                      <Text fontSize="sm">Expires in {effect.expiresAfterTurns} turns</Text>
                    </Flex>
                  ))}
                </Box>
              )}
              
              {/* If property has a meme name */}
              {selectedProperty.memeName && (
                <Box bg="yellow.50" p={2} borderRadius="md">
                  <Text fontSize="sm">Meme Name: <b>{selectedProperty.memeName}</b></Text>
                  <Text fontSize="xs" mt={1} color="orange.600">Players must say this name when landing or pay 10 K</Text>
                </Box>
              )}
            </VStack>
          </ModalBody>
          
          <ModalFooter>
            <VStack spacing={3} align="stretch" width="100%">
              {!selectedProperty.mortgaged ? (
                <>
                  <Button
                    colorScheme="green"
                    isDisabled={!canAddEngagement || selectedProperty.engagements >= 4}
                    width="100%"
                    leftIcon={<Text>➕</Text>}
                  >
                    Add Engagement ({engagementCost(selectedProperty)} K)
                  </Button>
                  
                  <Button
                    colorScheme="blue"
                    isDisabled={!canAddBlueCheckmark}
                    width="100%"
                    leftIcon={<Text>🔵</Text>}
                  >
                    Add Blue Checkmark ({blueCheckmarkCost(selectedProperty)} K)
                  </Button>
                  
                  <Button
                    colorScheme="red"
                    variant="outline"
                    width="100%"
                    leftIcon={<Text>💰</Text>}
                  >
                    Mortgage ({Math.floor(selectedProperty.price / 2)} K)
                  </Button>
                </>
              ) : (
                <Button
                  colorScheme="green"
                  width="100%"
                >
                  Unmortgage ({Math.floor(selectedProperty.price * 0.55)} K)
                </Button>
              )}
            </VStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  };

  // Calculate engagement cost based on property
  const engagementCost = (property) => {
    return Math.floor(property.price / 5);
  };

  // Calculate blue checkmark cost based on property
  const blueCheckmarkCost = (property) => {
    return Math.floor(property.price / 2);
  };

  // Main component render
  return (
    <Box p={4} bg="brand.50" borderRadius="md" boxShadow="sm">
      <Heading size="sm" mb={4}>Your Properties</Heading>
      
      {properties.length === 0 ? (
        <Box p={4} textAlign="center" color="gray.500" bg="white" borderRadius="md">
          You don't own any properties yet
        </Box>
      ) : (
        renderPropertyList()
      )}
      
      {renderPropertyModal()}
    </Box>
  );
};

export default PropertyManagement;