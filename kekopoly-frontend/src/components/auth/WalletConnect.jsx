import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  VStack,
  Heading,
  Text,
  Alert,
  AlertIcon,
  Flex,
  Image,
  useToast,
} from '@chakra-ui/react';
import { connectPhantomWallet, disconnectPhantomWallet } from '../../store/authSlice';

const WalletConnect = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  
  const { user, error, loading, isAuthenticated } = useSelector((state) => state.auth);
  
  const handleConnectWallet = async () => {
    // Check if Phantom is available
    if (!window.solana?.isPhantom) {
      toast({
        title: 'Phantom wallet not found',
        description: 'Please install Phantom wallet from https://phantom.app/',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      
      // Open Phantom wallet website in a new tab
      window.open('https://phantom.app/', '_blank');
      return;
    }
    
    const success = await dispatch(connectPhantomWallet());
    
    if (success) {
      toast({
        title: 'Wallet connected',
        description: 'Successfully connected to Phantom wallet',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      navigate('/');
    }
  };
  
  const handleDisconnectWallet = async () => {
    const success = await dispatch(disconnectPhantomWallet());
    
    if (success) {
      toast({
        title: 'Wallet disconnected',
        status: 'info',
        duration: 3000,
        isClosable: true,
      });
    }
  };
  
  const truncateAddress = (address) => {
    if (!address) return '';
    return address.slice(0, 6) + '...' + address.slice(-4);
  };
  
  return (
    <Box maxW="md" mx="auto" mt={8} p={6} borderWidth={1} borderRadius="lg" boxShadow="lg">
      <VStack spacing={6} align="stretch">
        <Heading textAlign="center">Connect Your Wallet</Heading>
        
        {error && (
          <Alert status="error" borderRadius="md">
            <AlertIcon />
            {error}
          </Alert>
        )}
        
        <Box textAlign="center">
          <Text mb={6} color="gray.600">
            Connect your Phantom wallet to access Kekopoly game features.
          </Text>
          
          {isAuthenticated ? (
            <VStack spacing={4}>
              <Flex 
                bg="gray.100" 
                p={3} 
                borderRadius="md" 
                align="center" 
                justify="center"
              >
                <Text fontWeight="bold">
                  Connected: {truncateAddress(user?.walletAddress)}
                </Text>
              </Flex>
              
              <Button 
                colorScheme="red" 
                variant="outline" 
                w="full"
                onClick={handleDisconnectWallet}
                isLoading={loading}
                loadingText="Disconnecting..."
              >
                Disconnect Wallet
              </Button>
              
              <Button
                colorScheme="blue"
                w="full"
                onClick={() => navigate('/')}
              >
                Go to Game Lobby
              </Button>
            </VStack>
          ) : (
            <VStack spacing={6}>
              <Image
                src="https://phantom.app/img/phantom-logo.svg"
                alt="Phantom Wallet"
                boxSize="64px"
              />
              
              <Button
                colorScheme="purple"
                size="lg"
                w="full"
                onClick={handleConnectWallet}
                isLoading={loading}
                loadingText="Connecting..."
              >
                Connect Phantom Wallet
              </Button>
            </VStack>
          )}
        </Box>
      </VStack>
    </Box>
  );
};

export default WalletConnect; 