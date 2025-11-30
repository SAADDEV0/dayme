
import { JournalEntry, JournalAttachment, GoogleConfig, ChecklistItem } from '../types';

const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const ROOT_FOLDER_NAME = 'My Journal';
const STORAGE_TOKEN_KEY = 'mindflow_google_token';
const STORAGE_CACHE_KEY = 'mindflow_journal_cache';
const IMAGE_CACHE_NAME = 'mindflow-images-v1';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Helper to convert images to PNG
const convertImageToPng = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/png') {
      resolve(file);
      return;
    }

    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const lastDot = file.name.lastIndexOf('.');
            const nameWithoutExt = lastDot === -1 ? file.name : file.name.substring(0, lastDot);
            const name = `${nameWithoutExt}.png`;
            const newFile = new File([blob], name, { type: 'image/png' });
            resolve(newFile);
          } else {
            reject(new Error('Canvas conversion failed'));
          }
          URL.revokeObjectURL(url);
        }, 'image/png');
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    
    img.src = url;
  });
};

export const DriveService = {
  tokenClient: null as any,
  accessToken: null as string | null,
  isInitialized: false,

  init: async (config: GoogleConfig): Promise<void> => {
    const waitForScripts = () => new Promise<void>((resolve) => {
      const check = () => {
        if (window.gapi && window.google) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });

    await waitForScripts();

    return new Promise((resolve, reject) => {
      window.gapi.load('client', async () => {
        try {
          // Use manual load to avoid discovery docs issues
          await window.gapi.client.load('drive', 'v3');
          
          await window.gapi.client.init({
            apiKey: config.apiKey,
            discoveryDocs: [], // Explicitly empty to prevent auto-fetch
          });

          DriveService.tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: config.clientId,
            scope: SCOPES,
            callback: (response: any) => {
              if (response.error !== undefined) {
                throw response;
              }
              DriveService.handleTokenResponse(response);
            },
          });

          DriveService.isInitialized = true;
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  },

  handleTokenResponse: (response: any) => {
    DriveService.accessToken = response.access_token;
    const expiresIn = response.expires_in || 3599;
    const expiryTime = Date.now() + expiresIn * 1000;

    localStorage.setItem(STORAGE_TOKEN_KEY, JSON.stringify({
      token: response,
      expiry: expiryTime
    }));
  },

  restoreSession: (): boolean => {
    const stored = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (!stored) return false;

    try {
      const { token, expiry } = JSON.parse(stored);
      if (Date.now() < expiry - 5 * 60 * 1000) {
        window.gapi.client.setToken(token);
        DriveService.accessToken = token.access_token;
        return true;
      }
    } catch (e) {
      console.error("Failed to parse stored token", e);
    }

    localStorage.removeItem(STORAGE_TOKEN_KEY);
    return false;
  },

  signIn: (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!DriveService.tokenClient) {
        reject(new Error('Drive Service not initialized'));
        return;
      }

      DriveService.tokenClient.callback = (resp: any) => {
        if (resp.error) {
          reject(resp);
        } else {
          DriveService.handleTokenResponse(resp);
          resolve();
        }
      };

      if (window.gapi.client.getToken() === null) {
        DriveService.tokenClient.requestAccessToken({ prompt: 'consent' });
      } else {
        DriveService.tokenClient.requestAccessToken({ prompt: '' });
      }
    });
  },

  signOut: () => {
    const token = window.gapi.client.getToken();
    if (token !== null) {
      window.google.accounts.oauth2.revoke(token.access_token);
      window.gapi.client.setToken('');
      DriveService.accessToken = null;
    }
    localStorage.removeItem(STORAGE_TOKEN_KEY);
  },

  getIsLoggedIn: () => {
    return !!DriveService.accessToken;
  },

  findFile: async (name: string, parentId: string = 'root', mimeType?: string): Promise<any | null> => {
    let query = `name = '${name}' and '${parentId}' in parents and trashed = false`;
    if (mimeType) {
      query += ` and mimeType = '${mimeType}'`;
    }
    
    try {
      const response = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name, parents)',
        spaces: 'drive',
      });
      return response.result.files[0] || null;
    } catch (e) {
      console.error("Error finding file:", e);
      return null;
    }
  },

  createFolder: async (name: string, parentId: string = 'root'): Promise<string> => {
    const fileMetadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    };

    const response = await window.gapi.client.drive.files.create({
      resource: fileMetadata,
      fields: 'id',
    });

    return response.result.id;
  },

  getOrCreateFolder: async (name: string, parentId: string = 'root'): Promise<string> => {
    const existing = await DriveService.findFile(name, parentId, 'application/vnd.google-apps.folder');
    if (existing) return existing.id;
    return await DriveService.createFolder(name, parentId);
  },

  ensureDatePath: async (dateStr: string): Promise<{ dayFolderId: string, imagesFolderId: string }> => {
    const date = new Date(dateStr);
    const year = date.getFullYear().toString();
    const monthName = date.toLocaleString('default', { month: 'long' });
    const monthIndex = date.getMonth() + 1;
    const monthFolder = `${monthIndex} ${monthName}`;
    const day = date.getDate().toString();

    const rootId = await DriveService.getOrCreateFolder(ROOT_FOLDER_NAME);
    const yearId = await DriveService.getOrCreateFolder(year, rootId);
    const monthId = await DriveService.getOrCreateFolder(monthFolder, yearId);
    const dayId = await DriveService.getOrCreateFolder(day, monthId);
    const imagesId = await DriveService.getOrCreateFolder('images', dayId);

    return { dayFolderId: dayId, imagesFolderId: imagesId };
  },

  getCachedEntries: (): JournalEntry[] => {
    try {
      const cached = localStorage.getItem(STORAGE_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  },

  listEntries: async (): Promise<JournalEntry[]> => {
    const query = "appProperties has { key='type' and value='journal-entry' } and trashed = false";
    return DriveService._executeEntryQuery(query, true);
  },

  _fetchAllFolders: async (): Promise<Map<string, {name: string, parentId: string}>> => {
      const folderMap = new Map<string, {name: string, parentId: string}>();
      let pageToken = null;
      
      try {
          do {
              const response: any = await window.gapi.client.drive.files.list({
                  q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                  fields: 'nextPageToken, files(id, name, parents)',
                  spaces: 'drive',
                  pageSize: 1000,
                  pageToken: pageToken
              });
              
              const files = response.result.files;
              if (files) {
                  files.forEach((f: any) => {
                      if (f.id && f.name) {
                          folderMap.set(f.id, {
                              name: f.name,
                              parentId: f.parents ? f.parents[0] : null
                          });
                      }
                  });
              }
              pageToken = response.result.nextPageToken;
          } while (pageToken);
      } catch (e) {
          console.error("Error fetching folder hierarchy", e);
      }
      return folderMap;
  },

  getAllMedia: async (): Promise<JournalAttachment[]> => {
    const query = "(mimeType contains 'image/' or mimeType contains 'video/') and trashed = false";
    try {
      const imagesPromise = window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, thumbnailLink, webViewLink, createdTime, appProperties, parents)',
        spaces: 'drive',
        pageSize: 1000 
      });

      const foldersPromise = DriveService._fetchAllFolders();

      const [imagesRes, folderMap] = await Promise.all([imagesPromise, foldersPromise]);
      const rawImages = imagesRes.result.files || [];

      return rawImages.map((img: any) => {
          let journalDate = img.appProperties?.journalDate;

          if (!journalDate && img.parents && img.parents.length > 0) {
             try {
                 const imagesFolderId = img.parents[0];
                 const imagesFolder = folderMap.get(imagesFolderId);
                 
                 if (imagesFolder && imagesFolder.name.toLowerCase() === 'images' && imagesFolder.parentId) {
                     const dayFolderId = imagesFolder.parentId;
                     const dayFolder = folderMap.get(dayFolderId);
                     
                     if (dayFolder && dayFolder.parentId) {
                         const monthFolderId = dayFolder.parentId;
                         const monthFolder = folderMap.get(monthFolderId);
                         
                         if (monthFolder && monthFolder.parentId) {
                             const yearFolderId = monthFolder.parentId;
                             const yearFolder = folderMap.get(yearFolderId);

                             if (yearFolder) {
                                 const year = parseInt(yearFolder.name);
                                 const month = parseInt(monthFolder.name.split(' ')[0]);
                                 const day = parseInt(dayFolder.name);
                                 
                                 if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                                     const d = new Date(year, month - 1, day, 12, 0, 0);
                                     journalDate = d.toISOString();
                                 }
                             }
                         }
                     }
                 }
             } catch (e) {
                 // Fallback
             }
          }

          if (!journalDate) {
              journalDate = img.createdTime;
          }

          return {
              ...img,
              journalDate: journalDate,
              appProperties: { ...img.appProperties, journalDate }
          };
      });

    } catch (e) {
      console.error("Error fetching media", e);
      return [];
    }
  },

  searchEntries: async (term: string): Promise<JournalEntry[]> => {
    const sanitizedTerm = term.replace(/'/g, "\\'");
    const query = `appProperties has { key='type' and value='journal-entry' } and trashed = false and (name contains '${sanitizedTerm}' or fullText contains '${sanitizedTerm}')`;
    return DriveService._executeEntryQuery(query, false);
  },

  _executeEntryQuery: async (query: string, updateCache: boolean): Promise<JournalEntry[]> => {
    try {
      const response = await window.gapi.client.drive.files.list({
        q: query,
        fields: 'files(id, name, appProperties, createdTime, modifiedTime)',
        spaces: 'drive',
        pageSize: 100
      });

      const files = response.result.files || [];
      const entries: JournalEntry[] = [];

      for (const file of files) {
        const date = file.appProperties?.journalDate || file.createdTime;
        const title = file.appProperties?.title || file.name.replace(/\.md$/i, '') || 'Untitled Entry';
        
        entries.push({
          id: file.id,
          title: title,
          content: '', 
          mood: file.appProperties?.mood,
          date: date,
          updatedAt: file.modifiedTime,
          coverImage: file.appProperties?.coverImage,
          coverImageId: file.appProperties?.coverImageId,
        });
      }
      
      const sortedEntries = entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      if (updateCache) {
        localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(sortedEntries));
      }
      
      return sortedEntries;
      
    } catch (e) {
      console.error("Error querying entries", e);
      throw e;
    }
  },

  getEntryContent: async (fileId: string): Promise<{ content: string, attachments: JournalAttachment[], checklist: ChecklistItem[] }> => {
    try {
      const response = await window.gapi.client.drive.files.get({
        fileId: fileId,
        alt: 'media',
      });
      let content = response.body;

      const lines = content.split('\n');
      if (lines.length >= 3 && 
          lines[0].startsWith('Title: ') && 
          lines[1].startsWith('Date: ') && 
          lines[2].startsWith('Mood: ')) {
          
          let startIndex = 3;
          if (lines[startIndex] === '') {
            startIndex = 4;
          }
          content = lines.slice(startIndex).join('\n');
      }

      const checklist: ChecklistItem[] = [];
      const checklistMarker = '\n## Checklist\n';
      const checklistIndex = content.indexOf(checklistMarker);

      if (checklistIndex !== -1) {
          const checklistStr = content.substring(checklistIndex + checklistMarker.length);
          content = content.substring(0, checklistIndex).trim();
          
          checklistStr.split('\n').forEach((line: string) => {
              const match = line.match(/^- \[(x| )\] (.*)/);
              if (match) {
                  checklist.push({
                      checked: match[1] === 'x',
                      text: match[2]
                  });
              }
          });
      }

      const fileMeta = await window.gapi.client.drive.files.get({
        fileId: fileId,
        fields: 'parents'
      });
      
      const parentId = fileMeta.result.parents?.[0];
      let attachments: JournalAttachment[] = [];

      if (parentId) {
        const imagesFolder = await DriveService.findFile('images', parentId, 'application/vnd.google-apps.folder');
        
        if (imagesFolder) {
          const imgs = await window.gapi.client.drive.files.list({
            q: `'${imagesFolder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink)',
          });
          attachments = imgs.result.files as JournalAttachment[];
        }
      }

      return { content, attachments, checklist };
    } catch (e) {
      console.error("Error loading content", e);
      return { content: "Error loading content. Please check your internet connection.", attachments: [], checklist: [] };
    }
  },

  updateCoverImage: async (fileId: string, coverImageId: string, coverImageLink?: string): Promise<void> => {
      try {
        await window.gapi.client.drive.files.update({
            fileId: fileId,
            resource: {
                appProperties: { 
                    coverImageId: coverImageId,
                    coverImage: coverImageLink
                }
            }
        });
      } catch(e) {
          console.error("Failed to update cover image metadata", e);
      }
  },

  saveEntry: async (entry: JournalEntry, filesToUpload: File[], coverIndex?: number): Promise<{ id: string, coverImageId?: string, coverImage?: string }> => {
    const { dayFolderId, imagesFolderId } = await DriveService.ensureDatePath(entry.date);

    const safeTitle = (entry.title || 'Untitled').replace(/[/\\?%*:|"<>\.]/g, '-');
    const fileName = `${safeTitle}.md`;

    const moroccanDate = new Date().toLocaleString('en-GB', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(',', '');

    let checklistContent = '';
    if (entry.checklist && entry.checklist.length > 0) {
        checklistContent = '\n\n## Checklist\n' + entry.checklist.map(item => 
            `- [${item.checked ? 'x' : ' '}] ${item.text}`
        ).join('\n');
    }

    const formattedContent = `Title: ${entry.title}
Date: ${moroccanDate}
Mood: ${entry.mood || 'None'}

${entry.content}${checklistContent}`;

    const fileMetadata = {
      name: fileName,
      mimeType: 'text/markdown',
      parents: [dayFolderId],
      appProperties: {
        type: 'journal-entry',
        journalDate: entry.date,
        title: entry.title,
        mood: entry.mood || ''
      }
    };

    let fileId = entry.id;

    if (!fileId) {
      const existing = await DriveService.findFile('notes.md', dayFolderId);
      if (existing) fileId = existing.id;
    }

    if (fileId) {
      const currentFile = await window.gapi.client.drive.files.get({
           fileId: fileId,
           fields: 'parents'
      });
      const currentParents = currentFile.result.parents || [];
      
      if (!currentParents.includes(dayFolderId)) {
           const previousParents = currentParents.join(',');
           await window.gapi.client.drive.files.update({
               fileId: fileId,
               addParents: dayFolderId,
               removeParents: previousParents,
               fields: 'id, parents'
           });
      }

      await window.gapi.client.request({
        path: `/upload/drive/v3/files/${fileId}`,
        method: 'PATCH',
        params: { uploadType: 'media' },
        body: formattedContent
      });
      
      await window.gapi.client.drive.files.update({
        fileId: fileId,
        resource: {
          name: fileName,
          appProperties: { 
            title: entry.title, 
            journalDate: entry.date,
            mood: entry.mood || ''
          }
        }
      });
    } else {
      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(fileMetadata) +
        delimiter +
        'Content-Type: text/markdown\r\n' +
        '\r\n' +
        formattedContent +
        close_delim;

      const request = await window.gapi.client.request({
        path: '/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
        body: multipartRequestBody
      });
      
      fileId = request.result.id;
    }

    let coverImageIdToSet: string | undefined = undefined;
    let coverImageLinkToSet: string | undefined = undefined;

    let uploadIndex = 0;
    for (const rawFile of filesToUpload) {
       let fileToUpload = rawFile;
       if (rawFile.type.startsWith('image/')) {
         try {
           fileToUpload = await convertImageToPng(rawFile);
         } catch (e) {
           console.warn("Image conversion failed, uploading original", e);
         }
       }
       
       const reader = new FileReader();
       reader.readAsDataURL(fileToUpload);

       await new Promise<void>((resolve, reject) => {
           reader.onload = async () => {
             const base64Data = (reader.result as string).split(',')[1];
             const boundary = '-------314159265358979323846';
             const delimiter = "\r\n--" + boundary + "\r\n";
             const close_delim = "\r\n--" + boundary + "--";

             const metadata = {
                 name: fileToUpload.name,
                 parents: [imagesFolderId],
                 appProperties: {
                    type: 'journal-attachment',
                    journalDate: entry.date
                 }
             };

             const multipartRequestBody =
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: ' + (fileToUpload.type || 'application/octet-stream') + '\r\n' +
                'Content-Transfer-Encoding: base64\r\n' +
                '\r\n' +
                base64Data +
                close_delim;

             try {
                 const request = await window.gapi.client.request({
                    path: '/upload/drive/v3/files',
                    method: 'POST',
                    params: { uploadType: 'multipart', fields: 'id,thumbnailLink' },
                    headers: { 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
                    body: multipartRequestBody
                 });
                 
                 const data = request.result;
                 if (coverIndex !== undefined && uploadIndex === coverIndex) {
                    coverImageIdToSet = data.id;
                    coverImageLinkToSet = data.thumbnailLink;
                 }
                 resolve();
             } catch(e) {
                 console.error("Image upload failed", e);
                 reject(e);
             }
           };
           reader.onerror = reject;
       });
       uploadIndex++;
    }

    let finalCoverId = entry.coverImageId; 
    let finalCoverLink = entry.coverImage;

    if (coverImageIdToSet) {
        finalCoverId = coverImageIdToSet;
        finalCoverLink = coverImageLinkToSet;
    }

    if (finalCoverId) {
        try {
            await window.gapi.client.drive.files.update({
                fileId: fileId,
                resource: {
                    appProperties: { 
                        coverImage: finalCoverLink,
                        coverImageId: finalCoverId
                    }
                }
            });
        } catch(e) {
            console.error("Failed to update final cover image", e);
        }
    }

    try {
        const existingImagesReq = await window.gapi.client.drive.files.list({
            q: `'${imagesFolderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
            fields: 'files(id, appProperties)'
        });
        const existingImages = existingImagesReq.result.files || [];
        
        await Promise.all(existingImages.map((img: any) => {
            if (img.appProperties?.journalDate !== entry.date) {
                return window.gapi.client.drive.files.update({
                    fileId: img.id,
                    resource: {
                        appProperties: { journalDate: entry.date }
                    }
                });
            }
            return Promise.resolve();
        }));
    } catch (e) {
        console.warn("Failed to sync media dates", e);
    }

    return { id: fileId, coverImageId: finalCoverId, coverImage: finalCoverLink };
  },

  deleteEntry: async (fileId: string): Promise<void> => {
    const fileMeta = await window.gapi.client.drive.files.get({
      fileId: fileId,
      fields: 'parents'
    });
    
    const parentId = fileMeta.result.parents?.[0];
    if (parentId) {
       await window.gapi.client.drive.files.delete({
         fileId: parentId
       });
    }
  },

  deleteFile: async (fileId: string): Promise<void> => {
    await window.gapi.client.drive.files.delete({
      fileId: fileId
    });
  },

  fetchAuthenticatedBlob: async (url: string): Promise<string> => {
    if ('caches' in window) {
      try {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        const cachedResponse = await cache.match(url);
        
        if (cachedResponse) {
          const blob = await cachedResponse.blob();
          return URL.createObjectURL(blob);
        }
      } catch (e) {
        console.warn("Cache lookup failed", e);
      }
    }

    try {
      const token = window.gapi.client.getToken();
      const accessToken = token ? token.access_token : null;
      if (!accessToken) throw new Error("No access token");

      const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!response.ok) throw new Error(`Failed to fetch content: ${response.statusText}`);
      
      if ('caches' in window) {
         try {
           const cache = await caches.open(IMAGE_CACHE_NAME);
           cache.put(url, response.clone());
         } catch (e) {
           console.warn("Failed to cache response", e);
         }
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (e) {
        console.error("Authenticated fetch failed", e);
        throw e;
    }
  },

  downloadMedia: async (fileId: string): Promise<string> => {
    return DriveService.fetchAuthenticatedBlob(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  },

  getThumbnail: async (fileId: string, thumbnailLink?: string): Promise<string> => {
      if (thumbnailLink) {
         try {
           return await DriveService.fetchAuthenticatedBlob(thumbnailLink);
         } catch {
         }
      }
      return DriveService.downloadMedia(fileId);
  }
};
