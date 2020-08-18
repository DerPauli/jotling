import React, { useContext, useState, useEffect, useCallback } from 'react';
import PlusSVG from '../../../../assets/svg/PlusSVG';

import { LeftNavContext } from '../../../../contexts/leftNavContext';
import NewTag from './NewTag';
import CaratDownSVG from '../../../../assets/svg/CaratDownSVG';

import Collapse from 'react-css-collapse';

const RightNavTags = ({ activeTab }) => {
	const [currentDoc, setCurrentDoc] = useState('');
	const [pageTags, setPageTags] = useState([]);
	const [showNewTagInput, setShowNewTagInput] = useState(false);
	const [isOpen, setIsOpen] = useState({});

	const { linkStructure, navData } = useContext(LeftNavContext);

	// Keeps the currentDoc in state
	useEffect(() => {
		if (currentDoc !== navData.currentDoc) {
			setCurrentDoc(navData.currentDoc);
		}
	}, [navData.currentDoc, currentDoc]);

	// Keeps the list of pageTags up to date
	useEffect(() => {
		if (linkStructure.docTags && linkStructure.docTags.hasOwnProperty(currentDoc)) {
			setPageTags(linkStructure.docTags[currentDoc]);
		} else {
			if (pageTags.length !== 0) {
				setPageTags([]);
			}
		}
	}, [linkStructure, pageTags, currentDoc]);

	const deleteTag = useCallback(
		(docName, tagName) => {
			console.log('currentDoc: ', currentDoc);
			let newLinkStructure = JSON.parse(JSON.stringify(linkStructure));

			// Remove tag from docTags
			let currentDocTags = [
				...(newLinkStructure.docTags[docName] ? newLinkStructure.docTags[docName] : []),
			];
			if (currentDocTags.length) {
				let currentTagIndex = currentDocTags.findIndex((item) => item === tagName);
				currentDocTags.splice(currentTagIndex, 1);
				newLinkStructure.docTags[docName] = currentDocTags;
			}

			// Delete any links to our keyword
			let currentLinks = { ...(newLinkStructure.links ? newLinkStructure.links : {}) };
			let currentTagLinks = {
				...(newLinkStructure.tagLinks ? newLinkStructure.tagLinks : {}),
			};
			for (let linkNum of Object.keys(currentLinks)) {
				if (currentTagLinks.includes(linkNum)) {
					delete currentLinks.linkNum;
				}
			}
			newLinkStructure.links = currentLinks;

			// Delete the tagLinks for our tag
			if (newLinkStructure.tagLinks[tagName]) {
				delete newLinkStructure.tagLinks[tagName];
			}

			// NEED TO:
			//   set the new link structure, make sure it deletes
			//   fix the unique key error when deleting a key
			//   make sure the delete works :)
			//   then let's look at actually adding a link into the text
			//      for now, let's just type the word and test the link
			//      then, we'll need a way of choosing from available tags
			//      ideally, it would suggest tags in the selected text first as well as recently used tags
			//      need a way to search for tags too

			console.log(newLinkStructure);
		},
		[linkStructure, currentDoc]
	);

	return (
		<>
			<div className='add-tag-button' onClick={() => setShowNewTagInput(true)}>
				<PlusSVG />
			</div>
			{showNewTagInput && <NewTag {...{ setShowNewTagInput }} />}
			{console.log('isOpen: ', isOpen)}
			{pageTags.map((item) => (
				<>
					<p
						className={'tag-item' + (isOpen[item] ? ' open' : '')}
						key={item}
						onClick={() => setIsOpen({ ...isOpen, [item]: !isOpen[item] })}>
						<CaratDownSVG />
						{item}
					</p>
					<Collapse isOpen={!!isOpen[item]}>
						<div className='tag-item-options'>
							<span onClick={(e) => deleteTag(currentDoc, item)}>Delete</span>
							<span>Auto-tag</span>
						</div>
					</Collapse>
				</>
			))}
		</>
	);
};

export default RightNavTags;
