import { List, Repeat, Map } from 'immutable';
import {
	EditorState,
	SelectionState,
	ContentState,
	ContentBlock,
	genKey,
	CompositeDecorator,
	CharacterMetadata,
	Modifier,
	RichUtils,
} from 'draft-js';
import { setBlockData, getSelectedBlocksList } from 'draftjs-utils';
import {
	getAllBlockKeys,
	getBlockKeysForSelection,
	getTextSelection,
} from '../../utils/draftUtils';
import { findAllDocsInFolder } from '../navs/navFunctions';

import { LinkSourceDecorator, LinkDestDecorator } from './editorComponents/LinkDecorators';
import { HighlightTagDecorator } from './editorComponents/HighlightTagDecorator';
import { FindReplaceDecorator } from './editorComponents/FindReplaceDecorator';
import { BlockImageContainer } from './editorComponents/BlockImageContainer';
import { CompoundDecorator } from './editorComponents/CompoundDecorator';
import { WikiSectionDecorator } from './editorComponents/WikiSectionTitle';

function getEntityStrategy(type) {
	return function (contentBlock, callback, contentState) {
		contentBlock.findEntityRanges((character) => {
			const entityKey = character.getEntity();
			if (entityKey === null) {
				return false;
			}
			return contentState.getEntity(entityKey).getType() === type;
		}, callback);
	};
}

function getBlockStrategy(blockType) {
	return function (contentBlock, callback, contentState) {
		if (contentBlock.getType() === blockType) {
			callback(0, contentBlock.getLength());
		}
	};
}

const buildFindWithRegexFunction = (findTextArray, findRegisterRef, editorStateRef) => {
	var regexMetachars = /[(){[*+?.\\^$|]/g;
	// Escape regex metacharacters in the text
	for (var i = 0; i < findTextArray.length; i++) {
		findTextArray[i] = findTextArray[i].replace(regexMetachars, '\\$&');
	}
	var regex = new RegExp('(?:' + findTextArray.join('|') + ')', 'gi');

	return function (contentBlock, callback, contentState) {
		// If we have a list of block keys, make sure this block is in it
		// if (visibleBlockKeys && !visibleBlockKeys.includes(contentBlock.getKey())) {
		// 	return;
		// }

		// Don't run on wiki-section blocks
		if (contentBlock.getType() === 'wiki-section') {
			return;
		}

		let text = contentBlock.getText();
		const blockKey = contentBlock.getKey();

		if (findRegisterRef) {
			removeBlockFromFindRegisterRef(findRegisterRef, blockKey, findTextArray[0]);
		}

		let matchArr, start;
		while ((matchArr = regex.exec(text)) !== null) {
			start = matchArr.index;

			// INSERT A FUNCTION that will register this as a match
			if (findRegisterRef) {
				updateFindRegisterRef(
					findRegisterRef,
					blockKey,
					start,
					findTextArray[0],
					editorStateRef
				);
			}

			callback(start, start + matchArr[0].length);
		}
	};
};

const findTagsToHighlight = (wikiStructure, currentDoc) => {
	// Compiling a list of all tags
	let tagList = [];

	for (let doc of findAllDocsInFolder(wikiStructure, '')) {
		if (doc.fileName !== currentDoc) {
			tagList.push(doc.name);
		}
	}

	return buildFindWithRegexFunction(tagList);
};

const findSearchKeyword = (findText, findRegisterRef, editorStateRef) => {
	return buildFindWithRegexFunction([findText], findRegisterRef, editorStateRef);
};

const defaultDecorator = [
	{
		strategy: getEntityStrategy('LINK-SOURCE'),
		component: LinkSourceDecorator, // CREATE A COMPONENT TO RENDER THE ELEMENT - import to this file too
	},
	{
		strategy: getEntityStrategy('LINK-DEST'),
		component: LinkDestDecorator, // CREATE A COMPONENT TO RENDER THE ELEMENT - import to this file too
	},
	{
		strategy: getEntityStrategy('IMAGE'),
		component: BlockImageContainer, // CREATE A COMPONENT TO RENDER THE ELEMENT - import to this file too
	},
	{
		strategy: getBlockStrategy('wiki-section'),
		component: WikiSectionDecorator,
	},
];

export const generateDecorators = (
	docStructure,
	currentDoc,
	showAllTags,
	findText,
	findRegisterRef,
	editorStateRef
	// visibleBlockKeys
) => {
	let decoratorArray = [...defaultDecorator];

	if (showAllTags) {
		decoratorArray.push({
			strategy: findTagsToHighlight(docStructure.pages, currentDoc),
			component: HighlightTagDecorator,
		});
	}

	if (findText) {
		decoratorArray.push({
			strategy: findSearchKeyword(findText, findRegisterRef, editorStateRef),
			component: FindReplaceDecorator,
		});
	}
	// console.log('inside our decorator generating function');
	return new CompoundDecorator(decoratorArray);
	// return new CompositeDecorator(decoratorArray);
};

export const defaultCompositeDecorator = new CompositeDecorator(defaultDecorator);

// NEW FUNCTION
// editorState, linkStructure, navData.currentDoc
// List all link entities in the document
// Pull all the tags from the link structure
// Pull all the links for each tag
// Check at all links exist in the document entities
// Add new entities for new links (include the link id and alias boolean)
// Update all content of link entities if source content updated (and no alias)
// Remove link entities that have been removed
//   If aliased, we will sever the link and leave it as orphaned instead.
//   If orphaned, remove that link and add a separate inline button notification of the severed link.

// UPDATE: if ##topOfPage, insert as first block. ##bottomOfPage is last block.
// Otherwise, insert after the block key in the initialSectionKey

export const updateLinkEntities = (editorState, linkStructure, currentDoc) => {
	let contentState = editorState.getCurrentContent();
	let blockArray = contentState.getBlocksAsArray();

	// Grab all used Link IDs
	let usedLinkIdArray = [];
	let nonAliasedEntities = {};
	for (let block of blockArray) {
		// Looping through all blocks' entities to grab the Link IDs
		block.findEntityRanges(
			(value) => {
				let entityKey = value.getEntity();
				if (!entityKey) {
					return false;
				}

				let entity = contentState.getEntity(entityKey);
				if (entity.getType() === 'LINK-DEST') {
					usedLinkIdArray.push(entity.data.linkId);
					// Only call the second function for links that are not aliased (which we need to synchronize)
					if (
						linkStructure.links[entity.data.linkId] &&
						linkStructure.links[entity.data.linkId].alias
					) {
						return false;
					}
					return true;
				}

				return false;
			},
			(start, end) => {
				let blockKey = block.getKey();
				let entityKey = block.getEntityAt(start);
				let entity = contentState.getEntity(entityKey);
				let linkId = entity.data.linkId;

				if (!linkStructure.links[linkId]) {
				}

				if (!nonAliasedEntities.hasOwnProperty(entityKey)) {
					nonAliasedEntities[entityKey] = { blockList: [] };
				}
				if (!nonAliasedEntities[entityKey].hasOwnProperty('startBlockKey')) {
					nonAliasedEntities[entityKey].startBlockKey = blockKey;
					nonAliasedEntities[entityKey].startOffset = start;
				}

				nonAliasedEntities[entityKey] = {
					...nonAliasedEntities[entityKey],
					linkId,
					blockList: [...nonAliasedEntities[entityKey].blockList, blockKey],
					endBlockKey: blockKey,
					endOffset: end,
				};
			}
		);
	}

	// Grabbing all links that should be included on the page
	const docId = currentDoc.slice(3, -5);
	let linksToPage = linkStructure.tagLinks[docId] ? linkStructure.tagLinks[docId] : [];

	// Comparing the total with the used to find the unused links
	let unusedLinkIds = [];
	for (let linkId of linksToPage) {
		if (!usedLinkIdArray.includes(linkId)) {
			unusedLinkIds = [...unusedLinkIds, linkId];
		}
	}

	// If we have unusedLinkIds, and currently the page just has an empty block, delete that block
	let newEditorState = editorState;
	if (unusedLinkIds.length && blockArray.length === 1) {
		const block = blockArray[0];
		if (block.getLength() === 0) {
			const selectionState = SelectionState.createEmpty();
			const newSelectionState = selectionState.merge({
				anchorKey: block.getKey(),
				anchorOffset: 0,
				focusKey: block.getKey(),
				focusOffset: 1,
			});

			let contentState = editorState.getCurrentContent();
			let newContentState = Modifier.removeRange(contentState, newSelectionState, 'forward');

			newEditorState = EditorState.push(newEditorState, newContentState, 'delete-character');
		}
	}

	// Inserting the unsused links at the bottom of the page
	for (let linkId of unusedLinkIds) {
		// If we have a new line character inside our content, we need to break it up into
		// multiple blocks.

		const linkContentArray = linkStructure.links[linkId].content.split('\n');
		let sectionKey = linkStructure.links[linkId].initialSectionKey;
		const newSectionOptions = linkStructure.links[linkId].newSectionOptions;
		console.log('sectionKey:', sectionKey);
		const blockKeys = [];

		let newContentState = newEditorState.getCurrentContent();
		let newBlockArray = newContentState.getBlocksAsArray();

		// If only 1 block in the array and that block is empty, remove it
		if (newBlockArray.length === 1 && newBlockArray[0].getLength() === 0) {
			newBlockArray.pop();
		}

		// If creating a new section
		if (newSectionOptions) {
			// Create the new section block
			const insertBeforeKey = newSectionOptions.insertBeforeKey;
			const newSectionBlockKey = genKey();
			const newSectionBlock = new ContentBlock({
				key: newSectionBlockKey,
				type: 'wiki-section',
				text: newSectionOptions.newName,
				characterList: List(
					Repeat(CharacterMetadata.create(), newSectionOptions.newName.length)
				),
			});

			// Position the new section block
			if (insertBeforeKey === '##topOfPage') {
				newBlockArray.unshift(newSectionBlock);
			} else {
				const sectionIndex = newBlockArray.findIndex(
					(item) => item.getKey() === insertBeforeKey
				);
				if (sectionIndex !== -1) {
					// If we found a matching section block key, insert afterwards
					newBlockArray.splice(sectionIndex, 0, newSectionBlock);
				} else {
					// Otherwise, push to the end of the page
					newBlockArray.push(newSectionBlock);
				}
			}

			// This is now the section we're inserting after
			sectionKey = newSectionBlockKey;
		}

		let blockIndex = newBlockArray.findIndex((item) => item.getKey() === sectionKey);
		let incrementBefore = true;
		if (sectionKey === '##topOfPage') {
			blockIndex = 0;
			incrementBefore = false;
		}

		for (let content of linkContentArray) {
			const newBlockKey = genKey();
			blockKeys.push(newBlockKey);

			// Creating a new block with our link content
			const newBlock = new ContentBlock({
				key: newBlockKey,
				type: 'link-destination',
				text: content,
				characterList: List(Repeat(CharacterMetadata.create(), content.length)),
			});

			// Insert the new link block into the correct section
			console.log('blockIndex:', blockIndex);
			if (blockIndex !== -1) {
				// If we found a matching section block key, insert afterwards
				newBlockArray.splice(blockIndex + (incrementBefore ? 1 : 0), 0, newBlock);
				blockIndex++;
			} else {
				// Otherwise, push to the end of the page
				newBlockArray.push(newBlock);
			}
		}

		// Push the new content block into the editorState
		newEditorState = EditorState.push(
			newEditorState,
			ContentState.createFromBlockArray(newBlockArray),
			'split-block'
		);

		// Apply the LINK-DEST entity to the new block
		newEditorState = createTagDestLink(newEditorState, linkId, blockKeys);
	}

	let linkContentState = newEditorState.getCurrentContent();

	for (let entityKey of Object.keys(nonAliasedEntities)) {
		let linkData = nonAliasedEntities[entityKey];
		let structureContent = linkStructure.links[linkData.linkId]
			? linkStructure.links[linkData.linkId].content
			: '';

		// If removing the whole block, set the selection to the start of the next block
		// Otherwise we'll have a blank block remaining
		let anchorOffset = linkData.startOffset;
		let anchorKey = linkData.startBlockKey;
		if (structureContent === '') {
			const block = linkContentState.getBlockForKey(linkData.endBlockKey);
			const prevBlock = linkContentState.getBlockBefore(linkData.endBlockKey);
			if (block.getLength() === linkData.endOffset && prevBlock) {
				anchorKey = prevBlock.getKey();
				anchorOffset = prevBlock.getLength();
			}
		}

		const selectionState = SelectionState.createEmpty();
		const linkSelectionState = selectionState.merge({
			anchorKey: anchorKey,
			anchorOffset: anchorOffset,
			focusKey: linkData.endBlockKey,
			focusOffset: linkData.endOffset,
		});

		if (structureContent === '') {
			const block = linkContentState.getBlockForKey(linkData.endBlockKey);
			linkContentState = Modifier.removeRange(linkContentState, linkSelectionState, 'forward');

			// The rest of the code is only relevant if we aren't deleting the block.
			continue;
		}

		linkContentState = Modifier.replaceText(
			linkContentState,
			linkSelectionState,
			structureContent,
			null,
			entityKey
		);

		const blockList = nonAliasedEntities[entityKey].blockList;
		// for (let blockKey of blockList) {
		let blockKey = blockList[0];
		let block = linkContentState.getBlockForKey(blockKey);
		let blockText = block.getText();
		let newLineIndex = blockText.lastIndexOf('\n');

		while (newLineIndex !== -1) {
			const newLineSelectionState = selectionState.merge({
				anchorKey: blockKey,
				anchorOffset: newLineIndex,
				focusKey: blockKey,
				focusOffset: newLineIndex + 1,
			});

			linkContentState = Modifier.splitBlock(linkContentState, newLineSelectionState);

			block = linkContentState.getBlockForKey(blockKey);
			blockText = block.getText();
			newLineIndex = blockText.lastIndexOf('\n');
		}
		// }
	}

	// Push the new content block into the editorState
	newEditorState = EditorState.push(newEditorState, linkContentState, 'insert-characters');

	return newEditorState;
};

// Creating a new destination tag link
const createTagDestLink = (editorState, linkId, blockKeys) => {
	const selectionState = editorState.getSelection();
	const contentState = editorState.getCurrentContent();
	const endingBlock = contentState.getBlockForKey(blockKeys[blockKeys.length - 1]);

	// Store these to restore the selection at the end
	const anchorKey = selectionState.getAnchorKey();
	const anchorOffset = selectionState.getAnchorOffset();
	const focusKey = selectionState.getFocusKey();
	const focusOffset = selectionState.getFocusOffset();

	// Selecting the text to apply the entity(link) to
	const selectionStateForEntity = selectionState.merge({
		anchorKey: blockKeys[0], // Starting position
		anchorOffset: 0, // How much to adjust from the starting position
		focusKey: blockKeys[blockKeys.length - 1], // Ending position
		focusOffset: endingBlock.getText().length, // How much to adjust from the ending position.
	});

	// Apply the linkId as an entity to the selection
	const contentStateWithEntity = contentState.createEntity('LINK-DEST', 'MUTABLE', {
		linkId: linkId,
	});
	const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
	const contentStateWithLink = Modifier.applyEntity(
		contentStateWithEntity,
		selectionStateForEntity,
		entityKey
	);

	// Restoring the selection to the original selection
	const restoredSelectionState = selectionState.merge({
		anchorKey: anchorKey, // Starting block (position is the start)
		anchorOffset: anchorOffset, // How much to adjust from the starting position
		focusKey: focusKey, // Ending position (position is the start)
		focusOffset: focusOffset, // We added the space, so add 1 to this.
	});
	const reselectedEditorState = EditorState.forceSelection(
		editorState,
		restoredSelectionState
	);

	const newEditorState = EditorState.push(
		reselectedEditorState,
		contentStateWithLink,
		'apply-entity'
	);

	return newEditorState;
};

export const findVisibleBlocks = (editorRef) => {
	const bottom = window.innerHeight;
	const blockElementList = editorRef.current.editor.children[0].children;

	let blockKeyList = [];
	// Iterate through each of our blocks
	for (let element of blockElementList) {
		let rect = element.getBoundingClientRect();
		// If the block is visible on screen
		if (rect.top < bottom - 20 && rect.bottom > 80) {
			// Extract the block key and add it to the list to return
			let offsetKey = element.dataset.offsetKey;
			let blockKey = offsetKey.slice(0, offsetKey.indexOf('-'));
			blockKeyList.push(blockKey);
		} else if (blockKeyList.length) {
			// If we had previous matches and are now off screen, return the list.
			// return blockKeyList;
			break;
		}
	}
	return blockKeyList;
};

export const scrollToBlock = (blockKey, element = document) => {
	let blockElement = element.querySelector(`[data-offset-key='${blockKey}-0-0'`);

	let blockRect = blockElement.getBoundingClientRect();

	window.scrollTo({
		left: 0,
		top: Math.floor(blockRect.top + window.pageYOffset - 200, 0),
		behavior: 'smooth',
	});
};

// Creating a new source tag link
export const createTagLink = (
	tagName,
	editorStateRef,
	linkStructureRef,
	currentDoc,
	setEditorState,
	setLinkStructure,
	setSyncLinkIdList,
	initialSectionKey,
	newSectionOptions
) => {
	// Clear out any existing links in the selection
	const cleanedEditorState = removeLinkSourceFromSelection(
		editorStateRef.current,
		linkStructureRef.current,
		setLinkStructure,
		setSyncLinkIdList
	);

	// Increment the max id by 1, or start at 0
	let arrayOfLinkIds = Object.keys(linkStructureRef.current.links).map((item) => Number(item));
	let newLinkId = arrayOfLinkIds.length ? Math.max(...arrayOfLinkIds) + 1 : 0;

	const contentState = cleanedEditorState.getCurrentContent();
	const selectionState = cleanedEditorState.getSelection();

	// Apply the linkId as an entity to the selection
	const contentStateWithEntity = contentState.createEntity('LINK-SOURCE', 'MUTABLE', {
		linkId: newLinkId,
	});
	const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
	const contentStateWithLink = Modifier.applyEntity(
		contentStateWithEntity,
		selectionState,
		entityKey
	);
	const newEditorState = EditorState.push(
		cleanedEditorState,
		contentStateWithLink,
		'apply-entity'
	);

	// Get the selected text to include in the link
	const selectedText = getTextSelection(contentStateWithLink, selectionState);
	console.log('selectedText:', selectedText);

	// Updating the linkStructure with the new link
	let newLinkStructure = JSON.parse(JSON.stringify(linkStructureRef.current));

	// Ensure the page tag links exist
	if (!newLinkStructure.tagLinks[tagName]) {
		newLinkStructure.tagLinks[tagName] = [];
	}

	newLinkStructure.tagLinks[tagName].push(newLinkId); // FIX EVENTUALLY
	newLinkStructure.links[newLinkId] = {
		source: currentDoc, // Source document
		content: selectedText, // Selected text
		alias: null,
		sourceEntityKey: entityKey,
		initialSectionKey: initialSectionKey, // Section to insert the link into
		newSectionOptions: newSectionOptions, // Options if creating a new section
	};

	console.log('new link: ', newLinkStructure.links[newLinkId]);

	// Updating the linkStructure with the keyword the link is using
	if (!newLinkStructure.docLinks.hasOwnProperty(currentDoc)) {
		newLinkStructure.docLinks[currentDoc] = {};
	}
	newLinkStructure.docLinks[currentDoc][newLinkId] = tagName; // FIX EVENTUALLY

	setLinkStructure(newLinkStructure);
	setEditorState(newEditorState);
};

// Insert an image into a document
export const insertImageBlockData = (imageId, imageUseId, editorState, setEditorState) => {
	let contentState = editorState.getCurrentContent();
	const selectionState = editorState.getSelection();
	let blockKey = selectionState.getStartKey();
	let block = contentState.getBlockForKey(blockKey);

	// If block is a wiki-section, find the first block that isn't
	let isBlockWikiSection = block.getType() === 'wiki-section';
	if (isBlockWikiSection) {
		// Check the block after
		const blockAfter = contentState.getBlockAfter(blockKey);
		if (blockAfter && blockAfter.getType() !== 'wiki-section') {
			block = blockAfter;
			blockKey = blockAfter.getKey();
			isBlockWikiSection = false;
		}

		// Check the block before
		const blockBefore = contentState.getBlockBefore(blockKey);
		if (isBlockWikiSection && blockBefore && blockBefore.getType() !== 'wiki-section') {
			block = blockBefore;
			blockKey = blockBefore.getKey();
			isBlockWikiSection = false;
		}

		// If neither the block before or after can get the image, create a new one
		if (isBlockWikiSection) {
			// Lets grab the initial selection state and reset it when we're done
			const emptySelectionState = SelectionState.createEmpty();
			const splitBlockSelectionState = emptySelectionState.merge({
				anchorKey: blockKey, // Starting block (position is the start)
				anchorOffset: block.getLength(), // How much to adjust from the starting position
				focusKey: blockKey, // Ending position (position is the start)
				focusOffset: block.getLength(),
			});

			// Create the new block
			const newContentState = Modifier.splitBlock(contentState, splitBlockSelectionState);
			const newBlockForImage = newContentState.getBlockAfter(blockKey);
			const newBlockSelectionState = emptySelectionState.merge({
				anchorKey: newBlockForImage.getKey(), // Starting block (position is the start)
				anchorOffset: 0, // How much to adjust from the starting position
				focusKey: newBlockForImage.getKey(), // Ending position (position is the start)
				focusOffset: 0,
			});

			// Update the content state with the new block, set to an unstyled type
			contentState = Modifier.setBlockType(
				newContentState,
				newBlockSelectionState,
				'unstyled'
			);
			block = newBlockForImage;
			blockKey = newBlockForImage.getKey();
		}
	}

	// Add the image to the block metadata
	const blockData = block.getData();
	let blockImageArray = [...blockData.get('images', [])];
	blockImageArray.push({
		imageId,
		imageUseId,
	});
	const newBlockData = blockData.set('images', blockImageArray);

	// Select the end of the block
	const newSelectionState = SelectionState.createEmpty();
	const blockEndSelectionState = newSelectionState.merge({
		anchorKey: blockKey, // Starting position
		anchorOffset: 0, // How much to adjust from the starting position
		focusKey: blockKey, // Ending position
		focusOffset: 0, // How much to adjust from the ending position.
	});

	// Insert the character with the image entity at the end of the block
	const contentStateWithImage = Modifier.setBlockData(
		contentState,
		blockEndSelectionState,
		newBlockData
	);

	const newEditorState = EditorState.push(
		editorState,
		contentStateWithImage,
		'change-block-data'
	);
	setEditorState(newEditorState);
};

// Update the metadata of an image in a block
export const updateImageBlockData = (
	imageId,
	imageUseId,
	editorState,
	setEditorState,
	blockKey,
	imageData
) => {
	const contentState = editorState.getCurrentContent();

	// Get the block image metadata
	const block = contentState.getBlockForKey(blockKey);
	const blockData = block.getData();
	let blockImageArray = [...blockData.get('images', [])];

	// Update the image data in the block
	let imageIndex = blockImageArray.findIndex(
		(item) => imageId === item.imageId && imageUseId == item.imageUseId
	);
	blockImageArray.splice(imageIndex, 1, imageData);
	const newBlockData = blockData.set('images', blockImageArray);

	// Select the end(beginning?) of the block
	const newSelectionState = SelectionState.createEmpty();
	const selectionState = newSelectionState.merge({
		anchorKey: blockKey, // Starting position
		anchorOffset: 0, // How much to adjust from the starting position
		focusKey: blockKey, // Ending position
		focusOffset: 0, // How much to adjust from the ending position.
	});

	// Insert the character with the image entity at the end of the block
	const contentStateWithImage = Modifier.setBlockData(
		contentState,
		selectionState,
		newBlockData
	);

	const newEditorState = EditorState.push(
		editorState,
		contentStateWithImage,
		'change-block-data'
	);
	setEditorState(newEditorState);
};

// Update the find match in the find register array
const updateFindRegisterRef = (findRegisterRef, blockKey, start, findText, editorStateRef) => {
	let registerArray = [...findRegisterRef.current[findText.toLowerCase()]];
	const updatedMatch = { blockKey, start };

	let matchIndex = registerArray.findIndex(
		(item) => item.blockKey === blockKey && item.start === start
	);
	if (matchIndex !== -1) {
		return;
	}

	let blockMap = editorStateRef.current.getCurrentContent().getBlockMap();
	let blockKeyOrder = [...blockMap.keys()];

	let matchingBlockKeyIndex = registerArray.findIndex((item) => item.blockKey === blockKey);
	// If we found a block with a MATCHING BLOCK KEY
	if (matchingBlockKeyIndex !== -1) {
		// If that block is AFTER ours, insert it before
		if (registerArray[matchingBlockKeyIndex].start > start) {
			// Insert our updatedMatch
			registerArray.splice(matchingBlockKeyIndex, 0, updatedMatch);
		} else {
			// Otherwise, check blocks after until find a new blockKey OR the start is after ours
			let foundMatch = false;
			while (!foundMatch && matchingBlockKeyIndex <= registerArray.length - 1) {
				// If find a new blockKey OR the start is after ours
				if (
					registerArray[matchingBlockKeyIndex].blockKey !== blockKey ||
					registerArray[matchingBlockKeyIndex].start > start
				) {
					// Insert our updatedMatch
					registerArray.splice(matchingBlockKeyIndex, 0, updatedMatch);
					foundMatch = true;
				} else {
					matchingBlockKeyIndex += 1;
				}
			}
			// If we hit the end of the array, just push it onto the end
			if (!foundMatch) {
				registerArray.push(updatedMatch);
			}
		}
		// If we found NO MATCHING BLOCK KEY
	} else {
		// Find where the next block is in the block order
		let blockKeyIndex = blockKeyOrder.findIndex((item) => item === blockKey) + 1;
		if (blockKeyIndex === 0) {
			console.error('Our block key was NOT found in the blockKeyOrder array.');
			return;
		}

		// Check if that next block has a match. If so, inject our updatedMatch before it.
		let foundMatch = false;
		while (!foundMatch && blockKeyIndex <= blockKeyOrder.length - 1) {
			let nextBlockIndex = registerArray.findIndex(
				(item) => item.blockKey === blockKeyOrder[blockKeyIndex]
			);
			if (nextBlockIndex !== -1) {
				registerArray.splice(nextBlockIndex, 0, updatedMatch);
				foundMatch = true;
			}
			blockKeyIndex += 1;
		}

		if (!foundMatch) {
			registerArray.push(updatedMatch);
		}
	}

	findRegisterRef.current[findText.toLowerCase()] = [...registerArray];
};

const removeBlockFromFindRegisterRef = (findRegisterRef, blockKey, findText) => {
	let registerArray = [...findRegisterRef.current[findText.toLowerCase()]];
	// Remove all elements in the array for a given blockKey
	const updateRemoveIndex = () =>
		registerArray.findIndex((item) => item.blockKey === blockKey);

	let removeIndex = updateRemoveIndex();

	if (removeIndex !== -1) {
		while (removeIndex !== -1) {
			registerArray.splice(removeIndex, 1);
			removeIndex = updateRemoveIndex();
		}

		findRegisterRef.current[findText.toLowerCase()] = [...registerArray];
	}
};

export const insertTextWithEntity = (editorState, content, selection, block, text) => {
	const style = editorState.getCurrentInlineStyle();
	const entity = block.getEntityAt(selection.getStartOffset());

	const newContent = Modifier.insertText(content, selection, text, style, entity);

	return EditorState.push(editorState, newContent, 'insert-characters');
};

// Remove all links in a given editor selection, and update the linkStructure
export const removeLinkSourceFromSelection = (
	editorState,
	linkStructure,
	setLinkStructure,
	setSyncLinkIdList
) => {
	const contentState = editorState.getCurrentContent();
	const selectionState = editorState.getSelection();

	const linkData = grabSelectionLinkIdsAndContent(editorState);
	const linkIds = [...Object.keys(linkData)];
	let resyncLinkIds = [];

	let shouldResyncLinkStructure = false;
	let newLinkStructure = JSON.parse(JSON.stringify(linkStructure));

	for (let id of linkIds) {
		let content = linkStructure.links[id].content;
		if (linkData[id] === content) {
			// Delete all entries for the link from the linkStructure
			let source = linkStructure.links[id].source;
			let keyword = linkStructure.docLinks[source][id];

			delete newLinkStructure.links[id];
			delete newLinkStructure.docLinks[source][id];

			let newTagLinksArray = [...newLinkStructure.tagLinks[keyword]];
			let idIndex = newTagLinksArray.findIndex((item) => item === Number(id));
			newTagLinksArray.splice(idIndex, 1);
			newLinkStructure.tagLinks[keyword] = newTagLinksArray;

			shouldResyncLinkStructure = true;
		} else {
			// Push the id into the queue to resynchronize that link
			resyncLinkIds.push(id);
		}
	}

	// DONE
	// Find what linkId(s) we're removing from the selection
	// For each link, determine if we are removing the entire link or only part
	//    - We'll need to save the text from the link ranges to compare
	// If we're removing everything, remove the link from the linkStructure (links, docLinks, tagLinks)
	// Then set the syncLinkIdList to our partial links we need to remove

	// DONE NOTE: if just removing a segment inside a link... the link should really be split
	//   Maybe don't let people remove the middle of a link??

	// In our LINK-DEST pages, if a link is completely removed, we need to remove the links from that page as well

	// If we ever add any other entities and we only wnat to remove the LINK-SOURCE, this will be a problem
	const newContentState = Modifier.applyEntity(contentState, selectionState, null);
	const newEditorState = EditorState.push(editorState, newContentState, 'apply-entity');

	// I wonder if this will trigger too early, before the editor state has updated.
	// If so, return the list and set it after we set the state.
	if (resyncLinkIds.length) {
		setSyncLinkIdList(resyncLinkIds);
	}

	if (shouldResyncLinkStructure) {
		setLinkStructure(newLinkStructure);
	}

	return newEditorState;
};

// Returns an object of { [linkId]: linkText } for all LINK-SOURCE in a selectionState
const grabSelectionLinkIdsAndContent = (editorState) => {
	const contentState = editorState.getCurrentContent();
	const selection = editorState.getSelection();
	const startBlockKey = selection.getStartKey();
	const startOffset = selection.getStartOffset();
	const endBlockKey = selection.getEndKey();
	const endOffset = selection.getEndOffset();

	let linkData = {};

	let block = contentState.getBlockForKey(startBlockKey);
	let finished = false;
	while (!finished) {
		const currentBlockKey = block.getKey();

		// FIND ENTITY RANGES
		block.findEntityRanges(
			(char) => {
				const entityKey = char.getEntity();
				if (!entityKey) {
					return false;
				}

				const entity = contentState.getEntity(entityKey);
				return entity.getType() === 'LINK-SOURCE';
			},
			(start, end) => {
				let adjStart = start;
				let adjEnd = end;
				let skip = false;

				// Starting block - Only use the portion of the link inside our selection
				if (currentBlockKey === startBlockKey) {
					if (adjEnd < startOffset) {
						skip = true;
					}
					adjStart = Math.max(startOffset, adjStart);
				}

				// Ending block - Only use the portion of the link inside our selection
				if (currentBlockKey === endBlockKey) {
					if (adjStart > endOffset) {
						skip = true;
					}
					adjEnd = Math.min(endOffset, adjEnd);
				}

				if (!skip) {
					// Find the linkId
					const entityKey = block.getEntityAt(adjStart);
					const entity = contentState.getEntity(entityKey);
					const entityData = entity.getData();
					const linkId = entityData.linkId;

					// Find the linkText
					const allText = block.getText();
					const linkText = allText.slice(adjStart, adjEnd);

					if (linkId !== undefined) {
						if (linkData.hasOwnProperty(linkId)) {
							linkData[linkId] = linkData[linkId] + '\n' + linkText;
						} else {
							linkData[linkId] = linkText;
						}
					}
				}

				// if starting block && ending block

				// if starting block
				// if end is before start offset, ignore the link
				//  otherwise, take the greater of the start offset or the start

				// if ending block
				// if start is after end offset, ignore the link
				//  otherwise, take the lesser of the ending offset or the end
			}
		);

		if (currentBlockKey === endBlockKey) {
			finished = true;
		}

		block = contentState.getBlockAfter(currentBlockKey);
	}

	return linkData;
};

// Checks if the selected text has a given entity type
export const selectionHasEntityType = (editorState, entityType) => {
	const currentContent = editorState.getCurrentContent();
	const selection = editorState.getSelection();
	const startBlockKey = selection.getStartKey();
	const startOffset = selection.getStartOffset();
	const endBlockKey = selection.getEndKey();
	const endOffset = selection.getEndOffset();

	let block = currentContent.getBlockForKey(startBlockKey);
	let finished = false;
	while (!finished) {
		const currentBlockKey = block.getKey();
		const length = currentBlockKey === endBlockKey ? endOffset : block.getLength();
		let i = currentBlockKey === startBlockKey ? startOffset : 0;
		for (i; i < length; i++) {
			let entityKey = block.getEntityAt(i);
			if (entityKey) {
				let entity = currentContent.getEntity(entityKey);
				if (entity.get('type') === entityType) {
					// WE FOUND OUR MATCH, DO THE THING
					return true;
				}
			}
		}

		if (currentBlockKey === endBlockKey) {
			finished = true;
		}

		block = currentContent.getBlockAfter(currentBlockKey);
	}

	return false;
};

// Checks if selection is inside a LINK-SOURCE
export const selectionInMiddleOfLink = (editorState) => {
	const currentContent = editorState.getCurrentContent();
	const selection = editorState.getSelection();
	const startBlockKey = selection.getStartKey();
	const startOffset = selection.getStartOffset();
	const endBlockKey = selection.getEndKey();
	const endOffset = selection.getEndOffset();

	let startBlock =
		startOffset === 0
			? currentContent.getBlockBefore(startBlockKey)
			: currentContent.getBlockForKey(startBlockKey);

	let endBlock = currentContent.getBlockForKey(endBlockKey);
	let isSelectionAtBlockEnd = endBlock.getLength() <= endOffset; // >= ?
	if (isSelectionAtBlockEnd) {
		endBlock = currentContent.getBlockAfter(endBlockKey);
	}

	// If at the start/end of the document, can't be in the middle of a link.
	if (!endBlock || !startBlock) {
		return false;
	}

	let startEntityKey = startBlock.getEntityAt(
		startOffset === 0 ? startBlock.getLength() - 1 : startOffset - 1
	);
	let endEntityKey = endBlock.getEntityAt(isSelectionAtBlockEnd ? 0 : endOffset);

	if (startEntityKey && startEntityKey === endEntityKey) {
		let entity = currentContent.getEntity(startEntityKey);

		if (entity.getType() === 'LINK-SOURCE') {
			return true;
		}
	}

	return false;
};

// Returns true if a selected block matches the block type
export const selectionContainsBlockType = (editorState, blockType) => {
	const selectedBlocks = getSelectedBlocksList(editorState);
	if (selectedBlocks.size > 0) {
		// Loop through each block
		for (let i = 0; i < selectedBlocks.size; i += 1) {
			if (selectedBlocks.get(i).getType() === blockType) {
				return true;
			}
		}
	}
	return false;
};

// Insert a new section title into a Wiki page
export const insertNewSection = (editorState, setEditorState) => {
	const contentState = editorState.getCurrentContent();
	const selectionState = editorState.getSelection();
	console.log('inserting new section: ', selectionState.serialize());
	const startBlockKey = selectionState.getStartKey();
	const startBlock = contentState.getBlockForKey(startBlockKey);
	let insertBefore = true;
	let useCurrentBlock = selectionState.isCollapsed() && startBlock.getLength() === 0;

	// Check if we need to insert the section AFTER the current block
	if (selectionState.isCollapsed()) {
		const start = selectionState.getStartOffset();

		if (start === startBlock.getLength()) {
			insertBefore = false;
		}
	}

	// If an empty block is selected, convert that block instead
	let sectionBlockKey, contentWithSection;

	// If we're USING THE SELECTED block as a wiki-section
	if (useCurrentBlock) {
		sectionBlockKey = startBlockKey;
		contentWithSection = contentState;
	}

	// If instead we're INSERTING a new block BEFORE to use as a wiki-section
	if (insertBefore && !useCurrentBlock) {
		// Select the start of the block
		const emptySelectionState = SelectionState.createEmpty();
		const beginningSelectionState = emptySelectionState.merge({
			anchorKey: startBlockKey,
			anchorOffset: 0,
			focusKey: startBlockKey,
			focusOffset: 0,
		});

		// The new section block will have kept the old block key
		const splitContentState = Modifier.splitBlock(contentState, beginningSelectionState);
		sectionBlockKey = startBlockKey;

		// Migrate data from the old block the new block below it
		const origBlockData = splitContentState.getBlockForKey(sectionBlockKey).getData();
		const origBlockKey = splitContentState.getBlockAfter(sectionBlockKey).getKey();
		const origBlockSelectionState = emptySelectionState.merge({
			anchorKey: origBlockKey,
			anchorOffset: 0,
			focusKey: origBlockKey,
			focusOffset: 0,
		});
		contentWithSection = Modifier.setBlockData(
			splitContentState,
			origBlockSelectionState,
			origBlockData
		);
	}

	// If instead we're INSERTING a new block AFTER to use as a wiki-section
	if (!insertBefore && !useCurrentBlock) {
		contentWithSection = Modifier.splitBlock(contentState, selectionState);
		sectionBlockKey = contentWithSection.getKeyAfter(startBlockKey);
	}

	// Change the new block type to wiki-section
	const emptySelectionState = SelectionState.createEmpty();
	const sectionSelectionState = emptySelectionState.merge({
		anchorKey: sectionBlockKey,
		anchorOffset: 0,
		focusKey: sectionBlockKey,
		focusOffset: 0,
	});

	// Create and set new block data saying the block is new
	const newBlockData = new Map({
		wikiSection: {
			isNew: true,
		},
	});
	const contentWithBlockData = Modifier.setBlockData(
		contentWithSection,
		sectionSelectionState,
		newBlockData
	);

	// Changing the block type
	const contentWithBlockType = Modifier.setBlockType(
		contentWithBlockData,
		sectionSelectionState,
		'wiki-section'
	);

	// Adds default text
	const defaultText = 'Section Title';
	const contentWithDefaultText = Modifier.insertText(
		contentWithBlockType,
		sectionSelectionState,
		defaultText
	);

	// Push the new block onto the editorState
	const newEditorState = EditorState.push(editorState, contentWithDefaultText, 'split-block');

	// Select the text in the new section title
	const finalSelectionState = emptySelectionState.merge({
		anchorKey: sectionBlockKey,
		anchorOffset: 0,
		focusKey: sectionBlockKey,
		focusOffset: defaultText.length,
		hasFocus: true,
	});

	const finalEditorState = EditorState.forceSelection(newEditorState, finalSelectionState);
	console.log(
		'editorState to set in insertSection: ',
		finalEditorState.getSelection().serialize()
	);
	// const finalEditorState = newEditorState;

	setEditorState(finalEditorState);
};

// Check if the selectionState ends on a newline character
export const removeEndingNewline = (editorState) => {
	// Only check if we need to update the selection if the selection isn't collapsed
	if (!editorState.getSelection().isCollapsed()) {
		const selectionState = editorState.getSelection();
		const start = selectionState.getStartOffset();
		const end = selectionState.getEndOffset();

		// If the start and end are 0, we need to update the end
		if (
			start === 0 &&
			end === 0 &&
			selectionState.getStartKey() !== selectionState.getEndKey()
		) {
			const endKey = selectionState.getEndKey();
			const newEndBlock = editorState.getCurrentContent().getBlockBefore(endKey);
			const newEndKey = newEndBlock.getKey();

			// Select the block to update the data for
			const emptySelectionState = SelectionState.createEmpty();
			const newSelectionState = emptySelectionState.merge({
				anchorKey: selectionState.getStartKey(),
				anchorOffset: 0,
				focusKey: newEndKey,
				focusOffset: newEndBlock.getLength(),
			});

			console.log('Updated selection - removed newline character from end.');
			return EditorState.forceSelection(editorState, newSelectionState);
		}
	}

	return editorState;
};

// IDEA: We could possibly batch the updates and always update the whole doc after a 1sec delay

export const updateWordCount = (
	editorStateRef,
	origEditorState,
	setDocWordCountObj,
	option
) => {
	const contentState = editorStateRef.current.getCurrentContent();
	let keyArray = [];

	// Start with all blockKeys in the selection. All options except 'update-all' start from this.
	if (option !== 'update-all') {
		keyArray = getBlockKeysForSelection(origEditorState);
	}

	// Handle any options we were passed
	if (option) {
		const origContentState = origEditorState.getCurrentContent();
		const origSelection = origEditorState.getSelection();
		let extraKey = null;

		if (option === 'add-block-to-end') {
			// Check block after too (needed if deleting at end of block)
			extraKey = origContentState.getKeyAfter(origSelection.getEndKey());
		}
		if (option === 'add-block-to-start') {
			// Check block before too (needed if backspacing at start of block)
			extraKey = origContentState.getKeyBefore(origSelection.getStartKey());
		}
		if (option === 'add-new-end-block') {
			// Check if the new ending block was newly created (split-block)
			extraKey = contentState.getKeyBefore(editorStateRef.current.getSelection().getEndKey());
		}
		if (option === 'update-all') {
			// Check all unique block keys from before and after the change
			let allOrigBlocks = getAllBlockKeys(origContentState);
			let allNewBlocks = getAllBlockKeys(contentState);

			keyArray = Array.from(new Set([...allOrigBlocks, ...allNewBlocks]));
		}

		// If we added a key, push it to the array
		if (extraKey) {
			keyArray.push(extraKey);
		}
	}

	// Find the word count for each blockKey
	let newWordCountObj = {};
	for (let blockKey of keyArray) {
		let words = countWordsInBlock(contentState.getBlockForKey(blockKey));
		newWordCountObj[blockKey] = words;
	}

	setDocWordCountObj((prev) => ({
		...prev,
		...newWordCountObj,
	}));
};

// Get the total word count of the current document
export const getEditorStateWordCount = (editorState) => {
	const contentState = editorState.getCurrentContent();
	const keyArray = getAllBlockKeys(contentState);

	// Find the word count for each blockKey
	let newWordCountObj = {};
	for (let blockKey of keyArray) {
		let words = countWordsInBlock(contentState.getBlockForKey(blockKey));
		newWordCountObj[blockKey] = words;
	}

	return newWordCountObj;
};

// Counts the words in an individual block. Used in updateWordCount.
const countWordsInBlock = (block) => {
	// If block no longer exists, return 0;
	if (!block) {
		return 0;
	}

	let blockText = block.getText();

	// Trim off ending spaces
	while (blockText.slice(-1) === ' ') {
		console.log('trimmed an ending space');
		blockText = blockText.slice(0, -1);
	}

	// Count the space chunks (multiple spaces counts as 1) in the block
	let spaces = 0;
	for (let i in blockText) {
		if (blockText[i] === ' ' && i && blockText[i - 1] !== ' ') {
			spaces++;
		}
	}

	// Add 1 to represent the first word of the block.
	if (blockText.length) {
		spaces++;
	}

	return spaces;
};

// Check the editor keyCommand to see if and how to update the word count.
export const checkCommandForUpdateWordCount = (command) => {
	const updateCommandOptions = [
		{ array: ['delete', 'delete-word'], option: 'add-block-to-end' },
		{
			array: ['backspace', 'backspace-word', 'backspace-to-start-of-line'],
			option: 'add-block-to-start',
		},
		// { array: ['undo', 'redo'], option: 'update-all' }, // Undo not triggering, redo can wait
		{ array: ['split-block'], option: 'add-new-end-block' },
	];

	for (let item of updateCommandOptions) {
		if (item.array.includes(command)) {
			return item.option;
		}
	}

	return null;
};

// If adding a new line from the start/end of a wiki-section,
// change the new block to unstyled
export const checkWikiSectionSplitBlock = (editorState) => {
	const selection = editorState.getSelection();
	const currentContent = editorState.getCurrentContent();

	// If selecting the start of the block
	if (selection.getStartOffset() === 0) {
		const startBlockKey = selection.getStartKey();
		const startBlock = currentContent.getBlockForKey(startBlockKey);
		const blockType = startBlock.getType();

		// And the block type is a wiki-section, then change the first block to unstyled
		if (blockType === 'wiki-section') {
			// Split the block
			let newContentState = Modifier.splitBlock(currentContent, selection);

			// Selecting the block we're going to change the type of
			const blockToChange = newContentState.getBlockForKey(startBlockKey);
			const emptySelectionState = SelectionState.createEmpty();
			const blockToChangeSelection = emptySelectionState.merge({
				anchorKey: startBlockKey,
				anchorOffset: 0,
				focusKey: startBlockKey,
				focusOffset: blockToChange.getLength(),
			});

			// Change to unstyled
			newContentState = Modifier.setBlockType(
				newContentState,
				blockToChangeSelection,
				'unstyled'
			);

			// Select the final cursor position
			const newBlockKey = newContentState.getBlockAfter(startBlockKey).getKey();
			const finalSelection = emptySelectionState.merge({
				anchorKey: newBlockKey,
				anchorOffset: 0,
				focusKey: newBlockKey,
				focusOffset: 0,
			});

			// Push the block changes to the editorState
			const editorStateBeforeSelect = EditorState.push(
				editorState,
				newContentState,
				'split-block'
			);

			// Force the final selection
			return EditorState.forceSelection(editorStateBeforeSelect, finalSelection);
		}
	}

	// If selecting the end of the block
	const endBlock = currentContent.getBlockForKey(selection.getEndKey());
	if (
		endBlock.getType() === 'wiki-section' &&
		selection.getEndOffset() === endBlock.getLength()
	) {
		const endBlockKey = endBlock.getKey();

		// Split the block
		let newContentState = Modifier.splitBlock(currentContent, selection);

		// Selecting the block we're going to change the type of
		const blockToChange = newContentState.getBlockAfter(endBlockKey);
		const emptySelectionState = SelectionState.createEmpty();
		const blockToChangeSelection = emptySelectionState.merge({
			anchorKey: blockToChange.getKey(),
			anchorOffset: 0,
			focusKey: blockToChange.getKey(),
			focusOffset: 0,
		});

		// Change to unstyled
		newContentState = Modifier.setBlockType(
			newContentState,
			blockToChangeSelection,
			'unstyled'
		);

		// Push the block changes to the editorState
		const editorStateBeforeSelect = EditorState.push(
			editorState,
			newContentState,
			'split-block'
		);

		// Force the final selection
		return EditorState.forceSelection(editorStateBeforeSelect, blockToChangeSelection);
	}
	// If selecting the end of the block
	// wiki-section block
	// If the selection start is at the beginning
	// The original block needs to be converted to unstyled
	// or the selection end is at the end
	// The new block needs to be converted to unstyled
};
