import * as React from "react";
import { BrandingResult, replaceCurrentVideoBranding } from "../videoBranding/videoBranding";
import { SubmissionComponent } from "./SubmissionComponent";
import { getVideo, getVideoID, getYouTubeVideoID, isCurrentTimeWrong } from "../../maze-utils/src/video";
import { logError } from "../utils/logger";
import { TitleSubmission } from "../titles/titleData";
import { ThumbnailSubmission } from "../thumbnails/thumbnailData";
import { queueThumbnailCacheRequest, submitVideoBranding } from "../dataFetching";
import Config from "../config/config";
import { shouldStoreVotes } from "../utils/configUtils";
import { closeGuidelineChecklist, confirmGuidelines } from "./SubmissionChecklist";
import { TitleButton } from "./titleButton";

const submitButtonIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M14.1 7.1l2.9 2.9L6.1 20.7l-3.6.7.7-3.6L14.1 7.1zm0-2.8L1.4 16.9 0 24l7.1-1.4L19.8 9.9l-5.7-5.7zm7.1 4.3L24 5.7 18.3 0l-2.8 2.8 5.7 5.7z"/>
</svg>`;

export class SubmitButton extends TitleButton {
    submissions: BrandingResult;

    constructor() {
        super(submitButtonIcon, chrome.i18n.getMessage("OpenSubmissionMenu"), "cbSubmitButton");
        this.submissions = {
            thumbnails: [],
            titles: [],
            randomTime: null,
            videoDuration: null,
            casualVotes: []
        };
    }

    close(): void {
        closeGuidelineChecklist();

        super.close();
    }

    clearSubmissions(): void {
        this.setSubmissions({
            thumbnails: [],
            titles: [],
            randomTime: null,
            videoDuration: null,
            casualVotes: []
        });
    }

    setSubmissions(submissions: BrandingResult): void {
        this.submissions = submissions;
        this.render();
    }

    render(): void {
        if (this.root) {
            this.root?.render(<SubmissionComponent
                video={getVideo()!}
                videoID={getVideoID()!}
                submissions={this.submissions}
                submitClicked={(title, thumbnail, actAsVip) => this.submitPressed(title, thumbnail, actAsVip)}
            />);
        }
    }

    private async submitPressed(title: TitleSubmission | null, thumbnail: ThumbnailSubmission | null, actAsVip: boolean): Promise<boolean> {
        if (title) {
            title.title = title.title.trim();

            if (title.title.length === 0) {
                title = null;
            }
        }

        if (getVideoID() !== getYouTubeVideoID()) {
            alert(chrome.i18n.getMessage("videoIDWrongWhenSubmittingError"));
            return false;
        }

        if (isCurrentTimeWrong()) {
            alert(chrome.i18n.getMessage("submissionFailedServerSideAds"));
            return false;
        }

        if (!await confirmGuidelines(title)) {
            return false;
        }
        
        const result = await submitVideoBranding(getVideoID()!, title, thumbnail, false, actAsVip);

        if (result && result.ok) {
            this.close();

            // Try to get this generated by the server
            if (thumbnail && !thumbnail.original) {
                queueThumbnailCacheRequest(getVideoID()!, thumbnail.timestamp, undefined, false, true);
            }

            // Set the unsubmitted as selected
            if (shouldStoreVotes()) {
                const unsubmitted = Config.local!.unsubmitted[getVideoID()!] ??= {
                    titles: [],
                    thumbnails: []
                };

                unsubmitted.titles.forEach((t) => t.selected = false);
                unsubmitted.thumbnails.forEach((t) => t.selected = false);

                if (title) {
                    const unsubmittedTitle = unsubmitted.titles.find((t) => t.title.trim() === title!.title);
                    if (unsubmittedTitle) {
                        unsubmittedTitle.selected = true;
                    } else {
                        unsubmitted.titles.push({
                            title: title.title,
                            selected: true
                        });
                    }

                    unsubmitted.titles = unsubmitted.titles.filter((t) => t.selected);
                }
                
                if (thumbnail) {
                    if (thumbnail.original && !unsubmitted.thumbnails.find((t) => t.original)) {
                        unsubmitted.thumbnails.push({
                            original: true,
                            selected: true
                        });
                    } else {
                        const unsubmittedThumbnail = unsubmitted.thumbnails.find((t) => (t.original && thumbnail.original) 
                            || (!t.original && !thumbnail.original && t.timestamp === thumbnail.timestamp))
                        if (unsubmittedThumbnail) {
                            unsubmittedThumbnail.selected = true;
                        } else {
                            if (thumbnail.original) {
                                unsubmitted.thumbnails.push({
                                    original: true,
                                    selected: true
                                });
                            } else {
                                unsubmitted.thumbnails.push({
                                    original: false,
                                    timestamp: thumbnail.timestamp,
                                    selected: true
                                });
                            }
                        }
                    }

                    unsubmitted.thumbnails = unsubmitted.thumbnails.filter((t) => t.selected);
                }
            } else {
                delete Config.local!.unsubmitted[getVideoID()!];
            }

            Config.forceLocalUpdate("unsubmitted");

            setTimeout(() => replaceCurrentVideoBranding().catch(logError), 1100);

            return true;
        } else {
            const text = result.responseText;

            if (text.includes("<head>")) {
                alert(chrome.i18n.getMessage("502"));
            } else {
                alert(text);
            }

            return false;
        }
    }
}