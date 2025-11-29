#!/bin/bash

# Script to create GitHub repository and push elevenlabs-agent

REPO_NAME="elevenlabs-agent"
GITHUB_USER="jarekbird"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up GitHub repository for ${REPO_NAME}...${NC}\n"

# Check if GitHub token is provided
if [ -z "$GITHUB_TOKEN" ]; then
    echo -e "${YELLOW}GitHub token not found in environment.${NC}"
    echo -e "${YELLOW}You can either:${NC}"
    echo -e "  1. Set GITHUB_TOKEN environment variable and run this script again"
    echo -e "  2. Create the repository manually on GitHub and run:"
    echo -e "     ${GREEN}git remote add origin https://github.com/${GITHUB_USER}/${REPO_NAME}.git${NC}"
    echo -e "     ${GREEN}git push -u origin main${NC}"
    echo ""
    echo -e "${YELLOW}To create manually:${NC}"
    echo -e "  1. Go to https://github.com/new"
    echo -e "  2. Repository name: ${REPO_NAME}"
    echo -e "  3. Description: Node.js service for ElevenLabs agent integration with cursor-runner"
    echo -e "  4. Set to Private or Public (your choice)"
    echo -e "  5. Do NOT initialize with README, .gitignore, or license (we already have these)"
    echo -e "  6. Click 'Create repository'"
    echo ""
    read -p "Have you created the repository on GitHub? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Please create the repository first, then run this script again.${NC}"
        exit 1
    fi
else
    # Create repository via GitHub API
    echo -e "${GREEN}Creating repository via GitHub API...${NC}"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: token ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github.v3+json" \
        https://api.github.com/user/repos \
        -d "{
            \"name\": \"${REPO_NAME}\",
            \"description\": \"Node.js service for ElevenLabs agent integration with cursor-runner\",
            \"private\": false
        }")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$REPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" -eq 201 ]; then
        echo -e "${GREEN}Repository created successfully!${NC}"
    elif [ "$HTTP_CODE" -eq 422 ]; then
        echo -e "${YELLOW}Repository may already exist. Continuing...${NC}"
    else
        echo -e "${RED}Failed to create repository. HTTP code: ${HTTP_CODE}${NC}"
        echo -e "${YELLOW}Response: ${BODY}${NC}"
        echo -e "${YELLOW}Please create the repository manually on GitHub.${NC}"
        exit 1
    fi
fi

# Check if remote already exists
if git remote get-url origin >/dev/null 2>&1; then
    echo -e "${YELLOW}Remote 'origin' already exists.${NC}"
    CURRENT_URL=$(git remote get-url origin)
    echo -e "Current URL: ${CURRENT_URL}"
    read -p "Do you want to update it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git remote set-url origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
        echo -e "${GREEN}Remote updated.${NC}"
    fi
else
    # Add remote
    echo -e "${GREEN}Adding GitHub remote...${NC}"
    git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
    echo -e "${GREEN}Remote added.${NC}"
fi

# Push to GitHub
echo -e "${GREEN}Pushing to GitHub...${NC}"
git push -u origin main

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Successfully pushed to GitHub!${NC}"
    echo -e "${GREEN}Repository URL: https://github.com/${GITHUB_USER}/${REPO_NAME}${NC}"
else
    echo -e "${RED}Failed to push. Please check your credentials and try again.${NC}"
    exit 1
fi

