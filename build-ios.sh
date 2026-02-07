#!/bin/bash
set -e
npm run build
npx cap sync ios
npx cap open ios
