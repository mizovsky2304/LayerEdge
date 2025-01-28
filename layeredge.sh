#!/bin/bash

# Script save path
SCRIPT_PATH="$HOME/layeredge.sh"

# Main menu function
function main_menu() {
    while true; do
        clear
        echo "================================================================"
        echo "To exit the script, press Ctrl + C on your keyboard."
        echo "Please select an operation to perform:"
        echo "1. Deploy LayerEdge node"
        echo "2. Exit script"
        echo "================================================================"
        read -p "Enter your choice (1/2): " choice

        case $choice in
            1)  deploy_layeredge_node ;;
            2)  exit ;;
            *)  echo "Invalid choice, please try again!"; sleep 2 ;;
        esac
    done
}

# Check and install dependencies
function install_dependencies() {
    echo "Checking system dependencies..."

    # Check and install git
    if ! command -v git &> /dev/null; then
        echo "Git not found, installing git..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y git
        elif command -v yum &> /dev/null; then
            sudo yum install -y git
        elif command -v brew &> /dev/null; then
            brew install git
        else
            echo "Unable to install git automatically. Please install git manually and try again."
            exit 1
        fi
        echo "Git installed successfully!"
    else
        echo "Git is already installed."
    fi

    # Check and install node and npm
    if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
        echo "Node.js or npm not found, installing Node.js and npm..."
        if command -v apt-get &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_16.x | sudo -E bash -
            sudo yum install -y nodejs
        elif command -v brew &> /dev/null; then
            brew install node
        else
            echo "Unable to install Node.js and npm automatically. Please install them manually and try again."
            exit 1
        fi
        echo "Node.js and npm installed successfully!"
    else
        echo "Node.js and npm are already installed."
    fi

    echo "System dependencies check complete!"
}

# Deploy LayerEdge node
function deploy_layeredge_node() {
    # Check and install dependencies
    install_dependencies

    # Clone the repository
    echo "Cloning the repository..."

    # Check if target directory exists
    if [ -d "LayerEdge" ]; then
        echo "Detected existing LayerEdge directory."
        read -p "Delete the old directory and re-clone the repository? (y/n) " delete_old
        if [[ "$delete_old" =~ ^[Yy]$ ]]; then
            echo "Deleting old directory..."
            rm -rf LayerEdge
            echo "Old directory deleted."
        else
            echo "Skipping repository cloning and using the existing directory."
            read -n 1 -s -r -p "Press any key to continue..."
            return
        fi
    fi

    # Clone the repository
    if git clone https://github.com/mizovsky2304/LayerEdgeNode.git; then
        echo "Repository cloned successfully!"
    else
        echo "Failed to clone the repository. Check your network connection or the repository URL."
        read -n 1 -s -r -p "Press any key to return to the main menu..."
        main_menu
        return
    fi

    # Prompt user for proxy addresses
    echo "Enter proxy addresses (format: http://username:password@127.0.0.1:8080), one at a time. Press Enter to finish:"
    > proxy.txt  # Clear or create proxy.txt file
    while true; do
        read -p "Proxy address (press Enter to finish): " proxy
        if [ -z "$proxy" ]; then
            break  # End input if the user presses Enter
        fi
        echo "$proxy" >> proxy.txt  # Write proxy address to proxy.txt
    done

    # Check if wallets.txt exists and prompt for overwrite
    echo "Checking wallet configuration file..."
    overwrite="no"
    if [ -f "wallets.txt" ]; then
        read -p "wallets.txt already exists. Do you want to re-enter wallet information? (y/n) " overwrite
        if [[ "$overwrite" =~ ^[Yy]$ ]]; then
            rm -f wallets.txt
            echo "Old wallet information cleared. Please re-enter."
        else
            echo "Using the existing wallets.txt file."
        fi
    fi

    # Enter wallet information if needed
    if [ ! -f "wallets.txt" ] || [[ "$overwrite" =~ ^[Yy]$ ]]; then
        > wallets.txt  # Create or clear file
        echo "Enter wallet addresses and private keys, recommended format: wallet_address,private_key"
        echo "Enter one wallet at a time. Press Enter to finish:"
        while true; do
            read -p "Wallet address,private key (press Enter to finish): " wallet
            if [ -z "$wallet" ]; then
                if [ -s "wallets.txt" ]; then
                    break  # Allow end if file is not empty
                else
                    echo "At least one valid wallet address and private key is required!"
                    continue
                fi
            fi
            echo "$wallet" >> wallets.txt  # Write wallet information to wallets.txt
        done
    fi

    # Enter project directory
    echo "Entering project directory..."
    cd LayerEdge || {
        echo "Failed to enter directory. Check if the repository was cloned successfully."
        read -n 1 -s -r -p "Press any key to return to the main menu..."
        main_menu
        return
    }

    # Install dependencies
    echo "Installing dependencies with npm..."
    if npm install; then
        echo "Dependencies installed successfully!"
    else
        echo "Failed to install dependencies. Check your network connection or npm configuration."
        read -n 1 -s -r -p "Press any key to return to the main menu..."
        main_menu
        return
    fi

    # Notify the user of completion
    echo "Setup complete! Proxy addresses saved in proxy.txt, wallets saved in wallets.txt, and dependencies installed."

    # Start the project
    echo "Starting the project..."
    screen -S layer -dm bash -c "cd ~/LayerEdge && npm start"  # Start npm in a screen session
    echo "The project has been started in a screen session."
    echo "You can check the running status with the following command:"
    echo "screen -r layer"
    echo "To detach from the screen session without stopping the process, press Ctrl + A, then press D."

    # Prompt user to return to the main menu
    read -n 1 -s -r -p "Press any key to return to the main menu..."
    main_menu
}

# Call the main menu function
main_menu
