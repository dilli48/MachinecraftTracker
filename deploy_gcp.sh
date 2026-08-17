#!/bin/bash

set -e

echo "=========================================================="
echo "   Deploying MachinecraftTracker to Google Cloud Run       "
echo "=========================================================="

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL environment variable is not set."
  echo "Please set your Neon.tech connection URL before running this script:"
  echo "export DATABASE_URL='postgresql://user:password@ep-xyz.neon.tech/neondb?sslmode=require'"
  exit 1
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: No active Google Cloud project set in gcloud CLI."
  echo "Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

REGION=${GCP_REGION:-"asia-south1"}

echo "🚀 Building container and deploying to Cloud Run..."
echo "    Project: $PROJECT_ID"
echo "    Region:  $REGION"
echo "    Max Cost Cap: 2 Max Instances"

gcloud run deploy machinecraft-tracker \
  --source . \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=$DATABASE_URL,ALLOWED_ORIGINS=*" \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1

echo ""
echo "=========================================================="
echo "🎉 MachinecraftTracker is live on Google Cloud Run!"
echo "=========================================================="
