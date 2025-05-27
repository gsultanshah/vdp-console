import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { MongoClient, ObjectId } from 'mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageId = searchParams.get('page_id');

    if (!pageId) {
      return NextResponse.json({ error: 'Page ID is required' }, { status: 400 });
    }

    // Connect to MongoDB
    await connectDB();
    const client = new MongoClient(process.env.NEXT_PUBLIC_MONGODB_URI as string);
    await client.connect();
    const db = client.db('vdp');

    // Get the document from blockcodes collection
    const document = await db.collection('blockcodes').findOne({ _id: new ObjectId(pageId) });

    if (!document) {
      await client.close();
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Update status to processing
    await db.collection('blockcodes').updateOne(
      { _id: new ObjectId(pageId) },
      { $set: { status: 'processing' } }
    );

    let processedCount = 0;
    let errorCount = 0;

    try {
      // Encode the URL for the API call
      const encodedUrl = encodeURIComponent(document.url);

      // Get the origin from the request URL
      const requestUrl = new URL(request.url);
      const origin = requestUrl.origin;

      // Call the API to get voter data using absolute URL
      const voterResponse = await fetch(`${origin}/api/public-final-json?imageurl=${encodedUrl}`);
      if (!voterResponse.ok) {
        throw new Error(`Failed to fetch voter data: ${voterResponse.statusText}`);
      }

      const voterData = await voterResponse.json();

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

            // Use absolute URL for saving voter
            const saveResponse = await fetch(`${origin}/api/voters`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(voterPayload),
            });

            if (!saveResponse.ok) {
              const errorData = await saveResponse.json();
              console.error('Failed to save voter:', errorData);
              errorCount++;
            } else {
              processedCount++;
            }
          } catch (voterError) {
            console.error('Error processing individual voter:', voterError);
            errorCount++;
          }
        }
      }

      // Update status to completed
      await db.collection('blockcodes').updateOne(
        { _id: new ObjectId(pageId) },
        { $set: { status: 'completed' } }
      );

      await client.close();

      return NextResponse.json({
        success: true,
        page_id: pageId,
        processed_count: processedCount,
        error_count: errorCount
      });

    } catch (error) {
      // Update status to error if processing fails
      await db.collection('blockcodes').updateOne(
        { _id: new ObjectId(pageId) },
        { $set: { status: 'error' } }
      );

      await client.close();
      throw error;
    }

  } catch (error: any) {
    console.error('Failed to process page:', error);
    return NextResponse.json(
      { error: 'Failed to process page', details: error.message },
      { status: 500 }
    );
  }
} 