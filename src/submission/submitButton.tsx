import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import { BrandingResult, replaceCurrentVideoBranding } from "../videoBranding/videoBranding";
import { SubmissionComponent } from "./SubmissionComponent";
import { getVideo, getVideoID, isOnMobileYouTube } from "@ajayyy/maze-utils/lib/video";
import { log, logError } from "../utils/logger";
import { TitleSubmission } from "../titles/titleData";
import { ThumbnailSubmission } from "../thumbnails/thumbnailData";
import { submitVideoBranding } from "../dataFetching";
import Config from "../config";
import { addTitleChangeListener, getOrCreateTitleButtonContainer } from "../utils/titleBar";

export class SubmitButton {
    button: HTMLButtonElement;
    buttonImage: HTMLImageElement;
    container: HTMLElement;
    root: Root | null;

    mutationObserver?: MutationObserver;

    submissions: BrandingResult;

    constructor() {
        this.submissions = {
            thumbnails: [],
            titles: []
        }
    }

    async attachToPage(): Promise<void> {
        if (!getVideo()) {
            log("Not attaching submit button, no video");
            return;
        }

        const referenceNode = await getOrCreateTitleButtonContainer();
        if (referenceNode) {
            if (!referenceNode.contains(this.button)) {
                if (!this.button) {
                    this.button = document.createElement('button');
                    this.button.className = "cbSubmitButton cbButton";

                    this.buttonImage = document.createElement("img");
                    this.button.draggable = false;
                    this.buttonImage.className = "cbSubmitButtonImage";
                    this.buttonImage.src = chrome.runtime.getURL("icons/pencil.svg");

                    // Append image to button
                    this.button.appendChild(this.buttonImage);
                    this.button.addEventListener('click', () => {
                        if (this.container.style.display === "none") {
                            this.open();
                        } else {
                            this.close();
                        }
                    });
                }

                referenceNode.appendChild(this.button);
            }


            if (!referenceNode.contains(this.container)) {
                if (!this.container) {
                    this.container = document.createElement('span');
                    this.container.id = "cbSubmitMenu";
                    this.container.style.display = "none";
    
                    this.root = createRoot(this.container);
                    //todo: setup params, call this class and then test
                    //todo: don't render right away if not visible
                    this.render();

                    if (isOnMobileYouTube()) {
                        if (this.mutationObserver) {
                            this.mutationObserver.disconnect();
                        }
                        
                        this.mutationObserver = new MutationObserver(() => 
                            void this.attachToPage());
        
                        this.mutationObserver.observe(referenceNode, { 
                            childList: true,
                            subtree: true
                        });
                    }
                }
    
                referenceNode.parentElement?.appendChild(this.container);
            }
        }

        addTitleChangeListener(() => {
            this.render();
        });
    }

    close(): void {
        if (this.container) this.container.style.display = "none";
    }

    open(): void {
        this.container.style.removeProperty("display");
    }

    clearSubmissions(): void {
        this.setSubmissions({
            thumbnails: [],
            titles: []
        });

        this.render();
    }

    setSubmissions(submissions: BrandingResult): void {
        this.submissions = submissions;
        this.render();
    }

    render(): void {
        this.root?.render(<SubmissionComponent video={getVideo()!} videoID={getVideoID()!} submissions={this.submissions} submitClicked={(title, thumbnail) => this.submitPressed(title, thumbnail)} />);
    }

    private async submitPressed(title: TitleSubmission | null, thumbnail: ThumbnailSubmission | null): Promise<void> {
        if (title) {
            title.title = title.title.trim();
        }

        const result = await submitVideoBranding(getVideoID()!, title, thumbnail);

        if (result) {
            this.close();

            // Set the unsubmitted as selected
            const unsubmitted = Config.local!.unsubmitted[getVideoID()!];
            if (unsubmitted) {
                if (Config.config!.keepUnsubmitted && !chrome.extension.inIncognitoContext) {
                    unsubmitted.titles.forEach((t) => t.selected = false);
                    unsubmitted.thumbnails.forEach((t) => t.selected = false);

                    if (title) {
                        const unsubmittedTitle = unsubmitted.titles.find((t) => t.title === title.title);
                        if (unsubmittedTitle) unsubmittedTitle.selected = true;
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
                            if (unsubmittedThumbnail) unsubmittedThumbnail.selected = true;
                        }
                    }
                } else {
                    delete Config.local!.unsubmitted[getVideoID()!];
                }
            }

            replaceCurrentVideoBranding().catch(logError);
        }
    }
}