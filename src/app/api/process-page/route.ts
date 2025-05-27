import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MongoClient, ObjectId } from 'mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('page_id');

    // Connect to MongoDB
    await connectDB();
    const client = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await client.connect();
    const db = client.db('vdp');

    let document;

    if (!pageId) {
      // If no page_id provided, get the first available page
      document = await db.collection('blockcodes').findOne(
        { status: { $in: ['uploaded', 'pending'] } },
        { sort: { uploadedAt: 1 } }
      );

      if (!document) {
        await client.close();
        return NextResponse.json({ error: 'No available pages to process' }, { status: 404 });
      }
    } else {
      // Get the document with provided page_id
      document = await db.collection('blockcodes').findOne({ _id: new ObjectId(pageId) });

      if (!document) {
        await client.close();
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
    }

    // Update status to processing
    await db.collection('blockcodes').updateOne(
      { _id: document._id },
      { $set: { status: 'processing' } }
    );

    let processedCount = 0;
    let errorCount = 0;
    let errorMessages: string[] = [];

    try {
      // Encode the URL for the API call
      const encodedUrl = encodeURIComponent(document.url);
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

      console.log('Fetching voter data from:', `${baseUrl}/api/public-final-json?imageurl=${encodedUrl}`);

      // Call the API to get voter data using NEXT_PUBLIC_SITE_URL
      const voterResponse = await fetch(`${baseUrl}/api/public-final-json?imageurl=${encodedUrl}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        cache: 'no-store',
      });

      if (!voterResponse.ok) {
        const errorText = await voterResponse.text();
        const errorMessage = `Failed to fetch voter data: ${voterResponse.status} ${voterResponse.statusText} - ${errorText}`;
        console.error('Voter data fetch failed:', {
          status: voterResponse.status,
          statusText: voterResponse.statusText,
          error: errorText
        });
        errorMessages.push(errorMessage);
        throw new Error(errorMessage);
      }

      const voterData = await voterResponse.json();
      console.log('Received voter data:', { 
        hasFinalJson: !!voterData.finalJson,
        arrayLength: voterData.finalJson?.length || 0 
      });

      // Save each voter to the database
      if (voterData.finalJson && Array.isArray(voterData.finalJson)) {
        for (const voter of voterData.finalJson) {
          try {
            // Transform voter data to match expected format
            const voterPayload = {
              cnic: voter.cnic,
              halkaName: document.halkaName,
              blockCode: document.blockCode,
              silsilaNo: voter.silsila_no,
              gharanaNo: voter.gharana_no,
              name: voter.remaining_text,
              row: voter.row,
              rowY: voter.row_y,
              rowHeight: voter.row_height,
              imageUrl: voter.image_url
            };

            // Skip if CNIC is empty
            if (!voterPayload.cnic) {
              console.log('Skipping voter with empty CNIC');
              continue;
            }

            console.log('Saving voter:', { cnic: voterPayload.cnic });

            // Use NEXT_PUBLIC_SITE_URL for saving voter
            try {
              const saveResponse = await fetch(`${baseUrl}/api/voters`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
                body: JSON.stringify(voterPayload),
                cache: 'no-store',
              });

              let responseData;
              const responseText = await saveResponse.text();
              
              try {
                responseData = responseText ? JSON.parse(responseText) : null;
              } catch (parseError: any) {
                console.error('Failed to parse response:', {
                  status: saveResponse.status,
                  statusText: saveResponse.statusText,
                  responseText,
                  error: parseError
                });
                throw new Error(`Invalid JSON response: ${parseError.message}`);
              }

              if (!saveResponse.ok) {
                const errorMessage = `Failed to save voter ${voterPayload.cnic}: ${saveResponse.status} ${saveResponse.statusText} - ${JSON.stringify(responseData || responseText)}`;
                console.error('Failed to save voter:', {
                  status: saveResponse.status,
                  statusText: saveResponse.statusText,
                  response: responseData || responseText,
                  requestUrl: `${baseUrl}/api/voters`,
                  requestBody: voterPayload
                });
                errorMessages.push(errorMessage);
                errorCount++;
              } else {
                processedCount++;
                console.log('Successfully saved voter:', { 
                  cnic: voterPayload.cnic,
                  response: responseData
                });
              }
            } catch (fetchError: any) {
              const errorMessage = `Failed to save voter ${voterPayload.cnic}: ${fetchError.message || 'Unknown error'} - URL: ${baseUrl}/api/voters`;
              console.error('Fetch error details:', {
                error: fetchError,
                message: fetchError.message,
                stack: fetchError.stack,
                requestUrl: `${baseUrl}/api/voters`,
                requestBody: voterPayload
              });
              errorMessages.push(errorMessage);
              errorCount++;
            }
          } catch (voterError: any) {
            const errorMessage = `Error processing voter: ${voterError.message}`;
            console.error('Error processing individual voter:', voterError);
            errorMessages.push(errorMessage);
            errorCount++;
          }
        }
      }

      // Update status to completed
      await db.collection('blockcodes').updateOne(
        { _id: document._id },
        { 
          $set: { 
            status: 'completed',
            process_log: {
              timestamp: new Date(),
              success: true,
              processed_count: processedCount,
              error_count: errorCount,
              errors: errorMessages,
              processed_page: {
                id: document._id.toString(),
                blockCode: document.blockCode,
                fileName: document.fileName,
                halkaName: document.halkaName,
                status: 'completed'
              }
            }
          } 
        }
      );

      await client.close();

      return NextResponse.json({
        success: true,
        processed_page: {
          id: document._id.toString(),
          blockCode: document.blockCode,
          fileName: document.fileName,
          halkaName: document.halkaName,
          status: 'completed'
        },
        processed_count: processedCount,
        error_count: errorCount,
        errors: errorMessages
      });

    } catch (error) {
      // Update status to error if processing fails
      await db.collection('blockcodes').updateOne(
        { _id: document._id },
        { 
          $set: { 
            status: 'error',
            process_log: {
              timestamp: new Date(),
              success: false,
              processed_count: processedCount,
              error_count: errorCount,
              errors: errorMessages,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          } 
        }
      );

      await client.close();
      throw error;
    }

  } catch (error: any) {
    console.error('Failed to process page:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process page', 
        details: error.message,
        errors: error.message ? [error.message] : []
      },
      { status: 500 }
    );
  }
} 