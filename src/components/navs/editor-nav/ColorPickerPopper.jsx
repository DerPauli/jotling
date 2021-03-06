import React, { useEffect, useState, useCallback } from 'react';

import PopperContainer from './../../containers/PopperContainer';

import { SketchPicker } from 'react-color';

const ColorPickerPopper = ({ referenceElement, closeFn, colorObj, setColorObj }) => {
	const [pickerColor, setPickerColor] = useState(colorObj.color);
	console.log('pickerColor: ', pickerColor);

	// Sync pickerColor with the colorObj.color
	// useEffect(() => {
	// 	setPickerColor(colorObj.color);
	// }, [colorObj]);

	const wrappedCloseFn = useCallback(
		(color) => {
			setColorObj((prev) => {
				// If already the first color, no change.
				if (prev.colorList[0] === color) {
					console.log('just returning prev');
					return prev;
				}

				// If already in the list, move to the front.
				let newColorList = [...prev.colorList];
				let colorIndex = newColorList.findIndex((item) => item === color);
				if (colorIndex !== -1) {
					newColorList.splice(colorIndex, 1);
					console.log('splicing from middle of list');
				} else {
					// Otherwise, remove one from the end.
					newColorList.pop();
					console.log('removing one from end of list');
				}

				// Add the color to the front and return.
				newColorList.unshift(color);
				console.log("new object we're setting: ", {
					color: color,
					colorList: newColorList,
				});
				return {
					// ...prev,
					color: color,
					colorList: newColorList,
				};
			});

			closeFn();
		},
		[closeFn]
	);

	// const handleChangeComplete = (color) => {
	// 	console.log('on change complete fired!');
	// 	setColorObj((prev) => ({
	// 		...prev,
	// 		color: color.hex,
	// 	}));
	// };

	return (
		<PopperContainer
			referenceElement={referenceElement}
			closeFn={() => wrappedCloseFn(pickerColor)}>
			<div className='accent-color-swatch-picker'>
				<SketchPicker
					disableAlpha={true}
					color={pickerColor}
					width={160}
					onChange={(color) => setPickerColor(color.hex)}
					// onChangeComplete={handleChangeComplete}
					presetColors={colorObj.colorList}
				/>
			</div>
		</PopperContainer>
	);
};

export default ColorPickerPopper;
