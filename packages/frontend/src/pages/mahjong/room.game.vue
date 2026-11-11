<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div v-if="room.isEnded" :class="$style.kyokuResult">
		<div :class="$style.kyokuResultCard">
			<div :class="$style.kyokuResultTitle">対局終了</div>
			<div v-for="house in endedHouses" :key="house" :class="[$style.kyokuResultRow, $style.kyokuResultRowCompact]">
				<div :class="$style.kyokuResultHouseRow">
					<span :class="$style.kyokuResultHouse">{{ houseLabel(house) }}</span>
					<template v-if="houseToUser(house) != null">
						<MkAvatar :user="houseToUser(house)!" :class="$style.kyokuResultAvatar"/>
						<span :class="$style.kyokuResultName">{{ houseToUser(house)!.name ?? houseToUser(house)!.username }}</span>
					</template>
					<span v-else :class="$style.kyokuResultName">CPU</span>
					<span :class="$style.kyokuResultEndPoints">{{ mj.points[house] }}点</span>
				</div>
			</div>
			<div :class="$style.kyokuResultFooter">
				<MkButton primary @click="backToLobby">ロビーに戻る</MkButton>
			</div>
		</div>
	</div>
	<div :class="$style.statusBar">
		<div :class="$style.statusBarLeft">
			<div :class="$style.roundInfo">{{ roundLabel }}</div>
			<div v-if="timerVisible" :class="$style.turnTimer">{{ timerLabel }}</div>
		</div>
		<div :class="$style.doraIndicators">
			<span :class="$style.doraIndicatorLabel">{{ i18n.ts._mahjong.dora }}</span>
			<XTile v-for="tile in mj.doraIndicateTiles" :key="tile" :tile="mj$(tile)" variation="1" :doras="[]"/>
			<img v-for="i in unrevealedDoraSlots" :key="`dora-back-${i}`" :src="`/client-assets/mahjong/tile-back.png`" :class="$style.doraBack"/>
		</div>
	</div>
	<div :class="$style.taku">
		<div :class="$style.centerPanel">
			<div style="text-align: center;">
				<div :class="$style.centerPanelTickerToi">
					<div style="position: absolute; left: 0; right: 0; bottom: 5px; text-align: center;">
						<span :class="$style.centerPanelHouse">{{ Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)) === 'e' ? i18n.ts._mahjong.east : Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)) === 's' ? i18n.ts._mahjong.south : Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)) === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north }}</span>
						<span :class="$style.centerPanelPoint">{{ mj.points[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))] }}</span>
					</div>
				</div>
				<div :class="$style.centerPanelTickerKami">
					<div style="position: absolute; left: 0; right: 0; bottom: 5px; text-align: center;">
						<span :class="$style.centerPanelHouse">{{ Mmj.prevHouse(mj.myHouse) === 'e' ? i18n.ts._mahjong.east : Mmj.prevHouse(mj.myHouse) === 's' ? i18n.ts._mahjong.south : Mmj.prevHouse(mj.myHouse) === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north }}</span>
						<span :class="$style.centerPanelPoint">{{ mj.points[Mmj.prevHouse(mj.myHouse)] }}</span>
					</div>
				</div>
				<div :class="$style.centerPanelTickerSimo">
					<div style="position: absolute; left: 0; right: 0; bottom: 5px; text-align: center;">
						<span :class="$style.centerPanelHouse">{{ Mmj.nextHouse(mj.myHouse) === 'e' ? i18n.ts._mahjong.east : Mmj.nextHouse(mj.myHouse) === 's' ? i18n.ts._mahjong.south : Mmj.nextHouse(mj.myHouse) === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north }}</span>
						<span :class="$style.centerPanelPoint">{{ mj.points[Mmj.nextHouse(mj.myHouse)] }}</span>
					</div>
				</div>
				<div :class="$style.centerPanelTickerMe">
					<div style="position: absolute; left: 0; right: 0; bottom: 5px; text-align: center;">
						<span :class="$style.centerPanelHouse">{{ mj.myHouse === 'e' ? i18n.ts._mahjong.east : mj.myHouse === 's' ? i18n.ts._mahjong.south : mj.myHouse === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north }}</span>
						<span :class="$style.centerPanelPoint">{{ mj.points[mj.myHouse] }}</span>
					</div>
				</div>
				<div :class="$style.centerPanelIndicatorContainerToi">
					<div style="position: absolute; left: 0; right: 0; bottom: 0;">
						<div :class="[$style.centerPanelIndicator, { [$style.centerPanelIndicatorIndicated]: mj.turn === Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)) }]"></div>
					</div>
				</div>
				<div :class="$style.centerPanelIndicatorContainerKami">
					<div style="position: absolute; left: 0; right: 0; bottom: 0;">
						<div :class="[$style.centerPanelIndicator, { [$style.centerPanelIndicatorIndicated]: mj.turn === Mmj.prevHouse(mj.myHouse) }]"></div>
					</div>
				</div>
				<div :class="$style.centerPanelIndicatorContainerSimo">
					<div style="position: absolute; left: 0; right: 0; bottom: 0;">
						<div :class="[$style.centerPanelIndicator, { [$style.centerPanelIndicatorIndicated]: mj.turn === Mmj.nextHouse(mj.myHouse) }]"></div>
					</div>
				</div>
				<div :class="$style.centerPanelIndicatorContainerMe">
					<div style="position: absolute; left: 0; right: 0; bottom: 0;">
						<div :class="[$style.centerPanelIndicator, { [$style.centerPanelIndicatorIndicated]: mj.turn === mj.myHouse }]"></div>
					</div>
				</div>
				<div :class="$style.centerPanelContent">
					<div>{{ mj.tilesCount }}</div>
					<div v-if="waitTiles.length > 0" :class="$style.waitTiles">
						<div :class="$style.waitTilesLabel">{{ i18n.ts._mahjong.waitTiles }}</div>
						<div :class="$style.waitTilesList">
							<XTile v-for="tile in waitTiles" :key="tile" :tile="mj$(tileTypeToTileId(tile))" variation="1" :doras="[]"/>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div :class="$style.handTilesOfToimen">
			<div v-for="tile in mj.handTiles[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" style="display: inline-block;">
				<img :src="`/client-assets/mahjong/tile-back.png`" :class="$style.handTileImgOfToimen"/>
			</div>
		</div>

		<div :class="$style.toimenMeldLine">
			<XHuro v-for="huro in mj.huros[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :class="$style.toimenHuroItem" :huro="huro" :caller="Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))" :doras="mj.doras"/>
		</div>

		<div :class="$style.kamityaHandLine">
			<div :class="$style.handTilesOfKamitya">
				<div v-for="tile in mj.handTiles[Mmj.prevHouse(mj.myHouse)]" :class="$style.sideTile">
					<img :src="`/client-assets/mahjong/tile-side.png`" :class="$style.sideTileImg"/>
				</div>
			</div>
		</div>

		<div :class="$style.kamityaMeldLine">
			<div :class="$style.huroTilesOfKamitya">
				<XHuro v-for="huro in mj.huros[Mmj.prevHouse(mj.myHouse)]" :class="$style.sideHuroItem" :huro="huro" :caller="Mmj.prevHouse(mj.myHouse)" :doras="mj.doras"/>
			</div>
		</div>

		<div :class="$style.simotyaHandLine">
			<div :class="$style.handTilesOfSimotya">
				<div v-for="tile in mj.handTiles[Mmj.nextHouse(mj.myHouse)]" :class="$style.sideTile">
					<img :src="`/client-assets/mahjong/tile-side.png`" :class="[$style.sideTileImg, $style.sideTileImgFlip]"/>
				</div>
			</div>
		</div>

		<div :class="$style.simotyaMeldLine">
			<div :class="$style.huroTilesOfSimotya">
				<XHuro v-for="huro in mj.huros[Mmj.nextHouse(mj.myHouse)]" :class="$style.sideHuroItem" :huro="huro" :caller="Mmj.nextHouse(mj.myHouse)" :doras="mj.doras"/>
			</div>
		</div>

		<div :class="$style.hoTilesContainer">
			<div :class="$style.hoTilesContainerOfToimen">
				<div :class="$style.hoTilesOfToimen">
					<div v-for="(tile, i) in mj.hoTiles[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :class="[$style.hoTile, { [$style.callTarget]: isCallTarget(Mmj.prevHouse(Mmj.prevHouse(mj.myHouse)), i, mj.hoTiles[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))].length) }]" :style="{ zIndex: mj.hoTiles[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))].length - i }">
						<XTile :tile="mj$(tile)" :variation="tile === mj.riichiTiles[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))] ? '3' : '2'" :doras="mj.doras"/>
					</div>
				</div>
			</div>
			<div :class="$style.hoTilesContainerOfKamitya">
				<div :class="$style.hoTilesOfKamitya">
					<div v-for="(tile, i) in mj.hoTiles[Mmj.prevHouse(mj.myHouse)]" :class="[$style.hoTile, { [$style.callTarget]: isCallTarget(Mmj.prevHouse(mj.myHouse), i, mj.hoTiles[Mmj.prevHouse(mj.myHouse)].length) }]">
						<XTile :tile="mj$(tile)" :variation="tile === mj.riichiTiles[Mmj.prevHouse(mj.myHouse)] ? '3' : '4'" :doras="mj.doras"/>
					</div>
				</div>
			</div>
			<div :class="$style.hoTilesContainerOfSimotya">
				<div :class="$style.hoTilesOfSimotya">
					<div v-for="(tile, i) in mj.hoTiles[Mmj.nextHouse(mj.myHouse)]" :class="[$style.hoTile, { [$style.callTarget]: isCallTarget(Mmj.nextHouse(mj.myHouse), i, mj.hoTiles[Mmj.nextHouse(mj.myHouse)].length) }]" :style="{ zIndex: mj.hoTiles[Mmj.nextHouse(mj.myHouse)].length - i }">
						<XTile :tile="mj$(tile)" :variation="tile === mj.riichiTiles[Mmj.nextHouse(mj.myHouse)] ? '3' : '5'" :doras="mj.doras"/>
					</div>
				</div>
			</div>
			<div :class="$style.hoTilesContainerOfMe">
				<div :class="$style.hoTilesOfMe">
					<div v-for="(tile, i) in mj.hoTiles[mj.myHouse]" :class="[$style.hoTile, { [$style.callTarget]: isCallTarget(mj.myHouse, i, mj.hoTiles[mj.myHouse].length) }]">
						<XTile :tile="mj$(tile)" :variation="tile === mj.riichiTiles[mj.myHouse] ? '3' : '1'" :doras="mj.doras"/>
					</div>
				</div>
			</div>
		</div>

		<div :class="$style.playersContainer">
			<div :class="[$style.playerOfToimen, $style.player]">
				<span :class="$style.playerHouse">{{ houseLabel(Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))) }}</span>
				<template v-if="users[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))] != null">
					<MkAvatar :user="users[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]!" style="width: 30px; height: 30px;"/>
					<span :class="$style.playerName">{{ users[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]!.name ?? users[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]!.username }}</span>
				</template>
				<template v-else>
					<span :class="$style.playerName">CPU</span>
				</template>
				<span v-if="mj.riichis[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :class="$style.riichi">{{ i18n.ts._mahjong.riichi }}</span>
			</div>
			<div :class="[$style.playerOfKamitya, $style.player]">
				<span :class="$style.playerHouse">{{ houseLabel(Mmj.prevHouse(mj.myHouse)) }}</span>
				<template v-if="users[Mmj.prevHouse(mj.myHouse)] != null">
					<MkAvatar :user="users[Mmj.prevHouse(mj.myHouse)]!" style="width: 30px; height: 30px;"/>
					<span :class="$style.playerName">{{ users[Mmj.prevHouse(mj.myHouse)]!.name ?? users[Mmj.prevHouse(mj.myHouse)]!.username }}</span>
				</template>
				<template v-else>
					<span :class="$style.playerName">CPU</span>
				</template>
				<span v-if="mj.riichis[Mmj.prevHouse(mj.myHouse)]" :class="$style.riichi">{{ i18n.ts._mahjong.riichi }}</span>
			</div>
			<div :class="[$style.playerOfSimotya, $style.player]">
				<span :class="$style.playerHouse">{{ houseLabel(Mmj.nextHouse(mj.myHouse)) }}</span>
				<template v-if="users[Mmj.nextHouse(mj.myHouse)] != null">
					<MkAvatar :user="users[Mmj.nextHouse(mj.myHouse)]!" style="width: 30px; height: 30px;"/>
					<span :class="$style.playerName">{{ users[Mmj.nextHouse(mj.myHouse)]!.name ?? users[Mmj.nextHouse(mj.myHouse)]!.username }}</span>
				</template>
				<template v-else>
					<span :class="$style.playerName">CPU</span>
				</template>
				<span v-if="mj.riichis[Mmj.nextHouse(mj.myHouse)]" :class="$style.riichi">{{ i18n.ts._mahjong.riichi }}</span>
			</div>
			<div :class="[$style.playerOfMe, $style.player]">
				<span :class="$style.playerHouse">{{ houseLabel(mj.myHouse) }}</span>
				<template v-if="users[mj.myHouse] != null">
					<MkAvatar :user="users[mj.myHouse]!" style="width: 30px; height: 30px;"/>
					<span :class="$style.playerName">{{ users[mj.myHouse]!.name ?? users[mj.myHouse]!.username }}</span>
				</template>
				<template v-else>
					<span :class="$style.playerName">CPU</span>
				</template>
				<span v-if="mj.riichis[mj.myHouse]" :class="$style.riichi">{{ i18n.ts._mahjong.riichi }}</span>
			</div>
		</div>

		<XHandTiles :class="$style.handTilesOfMe" :tiles="mj.myHandTiles" :doras="mj.doras" :selectableTiles="selectableTiles" :separateLast="isMyTurn && mj.drawnTile != null" @choose="chooseTile"/>

		<div :class="$style.myMeldLine">
			<XHuro v-for="huro in mj.huros[mj.myHouse]" :class="$style.myHuroItem" :huro="huro" :caller="mj.myHouse" :doras="mj.doras"/>
		</div>

		<div :class="$style.serifContainer">
			<div :class="$style.serifContainerOfToimen">
				<Transition
					:enterActiveClass="$style.transition_serif_enterActive"
					:leaveActiveClass="$style.transition_serif_leaveActive"
					:enterFromClass="$style.transition_serif_enterFrom"
					:leaveToClass="$style.transition_serif_leaveTo"
				>
					<img v-if="ronSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/ron.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ciiSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/cii.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ponSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/pon.png`" style="display: block; width: 100%;"/>
					<img v-else-if="kanSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/kan.png`" style="display: block; width: 100%;"/>
					<img v-else-if="tsumoSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/tsumo.png`" style="display: block; width: 100%;"/>
					<img v-else-if="riichiSerifHouses[Mmj.prevHouse(Mmj.prevHouse(mj.myHouse))]" :src="`/client-assets/mahjong/riichi.png`" style="display: block; width: 100%;"/>
				</Transition>
			</div>
			<div :class="$style.serifContainerOfKamitya">
				<Transition
					:enterActiveClass="$style.transition_serif_enterActive"
					:leaveActiveClass="$style.transition_serif_leaveActive"
					:enterFromClass="$style.transition_serif_enterFrom"
					:leaveToClass="$style.transition_serif_leaveTo"
				>
					<img v-if="ronSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/ron.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ciiSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/cii.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ponSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/pon.png`" style="display: block; width: 100%;"/>
					<img v-else-if="kanSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/kan.png`" style="display: block; width: 100%;"/>
					<img v-else-if="tsumoSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/tsumo.png`" style="display: block; width: 100%;"/>
					<img v-else-if="riichiSerifHouses[Mmj.prevHouse(mj.myHouse)]" :src="`/client-assets/mahjong/riichi.png`" style="display: block; width: 100%;"/>
				</Transition>
			</div>
			<div :class="$style.serifContainerOfSimotya">
				<Transition
					:enterActiveClass="$style.transition_serif_enterActive"
					:leaveActiveClass="$style.transition_serif_leaveActive"
					:enterFromClass="$style.transition_serif_enterFrom"
					:leaveToClass="$style.transition_serif_leaveTo"
				>
					<img v-if="ronSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/ron.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ciiSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/cii.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ponSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/pon.png`" style="display: block; width: 100%;"/>
					<img v-else-if="kanSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/kan.png`" style="display: block; width: 100%;"/>
					<img v-else-if="tsumoSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/tsumo.png`" style="display: block; width: 100%;"/>
					<img v-else-if="riichiSerifHouses[Mmj.nextHouse(mj.myHouse)]" :src="`/client-assets/mahjong/riichi.png`" style="display: block; width: 100%;"/>
				</Transition>
			</div>
			<div :class="$style.serifContainerOfMe">
				<Transition
					:enterActiveClass="$style.transition_serif_enterActive"
					:leaveActiveClass="$style.transition_serif_leaveActive"
					:enterFromClass="$style.transition_serif_enterFrom"
					:leaveToClass="$style.transition_serif_leaveTo"
				>
					<img v-if="ronSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/ron.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ciiSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/cii.png`" style="display: block; width: 100%;"/>
					<img v-else-if="ponSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/pon.png`" style="display: block; width: 100%;"/>
					<img v-else-if="kanSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/kan.png`" style="display: block; width: 100%;"/>
					<img v-else-if="tsumoSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/tsumo.png`" style="display: block; width: 100%;"/>
					<img v-else-if="riichiSerifHouses[mj.myHouse]" :src="`/client-assets/mahjong/riichi.png`" style="display: block; width: 100%;"/>
				</Transition>
			</div>
		</div>

		<div :class="$style.startTextContainer">
			<Transition
				:enterActiveClass="$style.transition_serif_enterActive"
				:leaveActiveClass="$style.transition_serif_leaveActive"
				:enterFromClass="$style.transition_serif_enterFrom"
				:leaveToClass="$style.transition_serif_leaveTo"
			>
				<img v-if="startTextShowing" :src="`/client-assets/mahjong/kaisi.png`" style="display: block; width: 100%;"/>
			</Transition>
		</div>

		<div :class="$style.ryuukyokuContainer">
			<Transition
				:enterActiveClass="$style.transition_serif_enterActive"
				:leaveActiveClass="$style.transition_serif_leaveActive"
				:enterFromClass="$style.transition_serif_enterFrom"
				:leaveToClass="$style.transition_serif_leaveTo"
			>
				<img v-if="ryuukyokued" :src="`/client-assets/mahjong/ryuukyoku.png`" style="display: block; width: 100%;"/>
			</Transition>
		</div>

		<div v-if="!tsumoPending" :class="$style.actions" class="_buttons">
			<MkButton v-if="mj.canRon != null" primary gradate @click="ron">{{ i18n.ts._mahjong.ron }}</MkButton>
			<MkButton v-if="mj.canPon != null" primary @click="pon">{{ i18n.ts._mahjong.pon }}</MkButton>
			<MkButton v-if="mj.canCii != null" primary @click="cii">{{ i18n.ts._mahjong.cii }}</MkButton>
			<MkButton v-if="mj.canKan != null" primary @click="kan">{{ i18n.ts._mahjong.kan }}</MkButton>
			<MkButton v-if="mj.canRon != null || mj.canPon != null || mj.canCii != null || mj.canKan != null" @click="skip">{{ i18n.ts._mahjong.skip }}</MkButton>
			<MkButton v-if="isMyTurn && mj.canAnkan()" @click="ankan">{{ i18n.ts._mahjong.ankan }}</MkButton>
			<MkButton v-if="isMyTurn && mj.canKakan()" @click="kakan">{{ i18n.ts._mahjong.kakan }}</MkButton>
			<MkButton v-if="isMyTurn && canHora" primary gradate @click="tsumoHora">{{ i18n.ts._mahjong.tsumo }}</MkButton>
			<MkButton v-if="isMyTurn && mj.canRiichi()" primary @click="riichi">{{ i18n.ts._mahjong.riichi }}</MkButton>
			<MkButton v-if="tileSelection != null" @click="cancelTileSelection">{{ i18n.ts.cancel }}</MkButton>
		</div>
	</div>
	<div
		v-if="ciiChoices != null"
		:class="$style.ciiChoicePanel"
		role="dialog"
		:aria-label="i18n.ts._mahjong.cii"
	>
		<div :class="$style.ciiChoiceTitle">{{ i18n.ts._mahjong.cii }}</div>
		<div :class="$style.ciiChoiceList">
			<button
				v-for="choice in ciiChoices"
				:key="choice.code"
				type="button"
				class="_button"
				:class="$style.ciiChoiceButton"
				:aria-label="`${i18n.ts._mahjong.cii} ${choice.tiles.join(' ')}`"
				@click="sendCii(choice)"
			>
				<span :class="$style.ciiChoiceTiles">
					<XTile v-for="tile in choice.tiles" :key="tile" :tile="mj$(tileTypeToTileId(tile))" variation="1" :doras="[]"/>
				</span>
			</button>
		</div>
		<div :class="$style.ciiChoiceFooter">
			<MkButton small @click="closeCiiChoices">{{ i18n.ts.cancel }}</MkButton>
		</div>
	</div>
	<div v-if="showKyokuResults" :class="$style.kyokuResult">
		<div :class="$style.kyokuResultCard">
			<div :class="$style.kyokuResultTitle">{{ roundLabel }} {{ ryuukyokued ? '流局' : '局結果' }}</div>
			<div v-if="ryuukyokued && abortiveKind != null" :class="$style.kyokuResultYaku">{{ ABORTIVE_DRAW_REASONS[abortiveKind] ?? abortiveKind }}による途中流局</div>
			<div v-if="ryuukyokued && (ryuukyokuResult?.nagashiHouses?.length ?? 0) > 0" :class="$style.kyokuResultYaku">流し満貫{{ (ryuukyokuResult?.nagashiHouses ?? []).map((h) => houseLabel(h)).join('・') }}</div>
			<div v-if="ryuukyokued">
				<div v-for="house in houses" :key="house" :class="[$style.kyokuResultRow, $style.kyokuResultRowCompact]">
					<div :class="$style.kyokuResultHouseRow">
						<span :class="$style.kyokuResultHouse">{{ houseLabel(house) }}</span>
						<template v-if="houseToUser(house) != null">
							<MkAvatar :user="houseToUser(house)!" :class="$style.kyokuResultAvatar"/>
							<span :class="$style.kyokuResultName">{{ houseToUser(house)!.name ?? houseToUser(house)!.username }}</span>
						</template>
						<span v-else :class="$style.kyokuResultName">CPU</span>
						<span :class="[$style.kyokuResultJudgement, isTenpaiHouse(house) ? $style.kyokuResultTenpai : $style.kyokuResultNoten]">{{ isTenpaiHouse(house) ? i18n.ts._mahjong.tenpai : i18n.ts._mahjong.noten }}</span>
						<XAnimatedPoints :class="$style.kyokuResultAnimatedPoints" :value="mj.points[house]" :delta="getPointDelta(house)"/>
					</div>
				</div>
			</div>
			<div v-else>
				<div v-for="(res, house) in kyokuResults" :key="house">
					<div v-if="res != null" :class="$style.kyokuResultRow">
						<div :class="$style.kyokuResultHouseRow">
							<span :class="$style.kyokuResultHouse">{{ houseLabel(house) }}</span>
							<template v-if="houseToUser(house) != null">
								<MkAvatar :user="houseToUser(house)!" :class="$style.kyokuResultAvatar"/>
								<span :class="$style.kyokuResultName">{{ houseToUser(house)!.name ?? houseToUser(house)!.username }}</span>
							</template>
							<span v-else :class="$style.kyokuResultName">CPU</span>
							<XAnimatedPoints :class="$style.kyokuResultAnimatedPoints" :value="mj.points[house]" :delta="getPointDelta(house)"/>
						</div>
						<div v-for="yaku in res.yakus" :class="$style.kyokuResultYaku">
							<span v-if="yaku.fan == null">{{ (i18n.ts._mahjong._yakus as Record<string, string>)[yaku.name] }} {{ (i18n.ts._mahjong._fanNames as Record<string, string>).yakuman }}</span>
							<span v-else>{{ (i18n.ts._mahjong._yakus as Record<string, string>)[yaku.name] }} {{ yaku.fan }}{{ i18n.ts._mahjong.fan }}</span>
						</div>
						<div :class="$style.kyokuResultYaku">{{ i18n.ts._mahjong.dora }} {{ res.doraCount }}{{ i18n.ts._mahjong.fan }}</div>
					</div>
				</div>
				<div :class="$style.kyokuResultSummary">
					<div v-for="house in kyokuResultSummaryHouses" :key="`summary-${house}`" :class="$style.kyokuResultHouseRow">
						<span :class="$style.kyokuResultHouse">{{ houseLabel(house) }}</span>
						<template v-if="houseToUser(house) != null">
							<MkAvatar :user="houseToUser(house)!" :class="$style.kyokuResultAvatar"/>
							<span :class="$style.kyokuResultName">{{ houseToUser(house)!.name ?? houseToUser(house)!.username }}</span>
						</template>
						<span v-else :class="$style.kyokuResultName">CPU</span>
						<XAnimatedPoints :class="$style.kyokuResultAnimatedPoints" :value="mj.points[house]" :delta="getPointDelta(house)"/>
					</div>
				</div>
			</div>
			<div :class="$style.kyokuResultFooter">
				<div v-if="timerMode === 'confirm'" :class="$style.kyokuResultTimer">{{ i18n.ts._mahjong.nextKyokuConfirmation }} {{ i18n.tsx._mahjong.remainingSeconds({ n: myTurnTimerRmain }) }}</div>
				<MkButton primary @click="confirmKyokuResult">{{ i18n.ts._mahjong.confirm }}</MkButton>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, reactive, ref, shallowRef, triggerRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import * as Mmj from 'misskey-mahjong';
import { useInterval } from '@@/js/use-interval.js';
import XTile from './tile.vue';
import XHuro from './huro.vue';
import XHandTiles from './hand-tiles.vue';
import XAnimatedPoints from './animated-points.vue';
import MkButton from '@/components/MkButton.vue';
import { deepClone } from '@/utility/clone.js';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import * as sound from '@/utility/sound.js';

//#region syntax suger
function mj$(tid: Mmj.TileId): Mmj.TileInstance {
	return Mmj.findTileByIdOrFail(tid);
}

function mj$type(tid: Mmj.TileId): Mmj.TileType {
	return mj$(tid).t;
}

function tileTypeToTileId(type: Mmj.TileType): Mmj.TileId {
	for (const [id, tile] of Mmj.TILE_ID_MAP) {
		if (tile.t === type && tile.red !== true) return id;
	}
	throw new Error(`tile not found: ${type}`);
}
//#endregion

const $i = ensureSignin();
const router = useRouter();

const props = defineProps<{
	room: Misskey.entities.MahjongRoomDetailed;
	connection?: Misskey.IChannelConnection<Misskey.Channels['mahjongRoom']> | null;
}>();

const room = ref<Misskey.entities.MahjongRoomDetailed>(deepClone(props.room));
const myUserNumber = computed(() => room.value.user1Id === $i.id ? 1 : room.value.user2Id === $i.id ? 2 : room.value.user3Id === $i.id ? 3 : 4);
const mj = shallowRef(new Mmj.PlayerGameEngine(myUserNumber.value, room.value.gameState as unknown as Mmj.PlayerState));
const houses: Mmj.House[] = ['e', 's', 'w', 'n'];
const endedHouses = computed<Mmj.House[]>(() => [...houses].sort((a, b) => mj.value.points[b] - mj.value.points[a]));
const kyokuResultSummaryHouses = computed<Mmj.House[]>(() => houses.filter((house) => kyokuResults.value[house] == null));

const isMyTurn = computed(() => {
	return mj.value.turn === mj.value.myHouse;
});

const canHora = computed(() => {
	return isMyTurn.value && iTsumoed.value && mj.value.canTsumoHora();
});

const users = computed(() => ({
	e: houseToUser('e'),
	s: houseToUser('s'),
	w: houseToUser('w'),
	n: houseToUser('n'),
}));

const waitTiles = computed(() => mj.value.getWaitTiles());

// ドラ表示牌は初期1枚 + カン最大4回で最大5枚。まだめくられていない分は裏向きで並べる。
const unrevealedDoraSlots = computed(() => Math.max(0, 5 - mj.value.doraIndicateTiles.length));

type TileSelection =
	| { action: 'riichi'; }
	| { action: 'ankan'; tiles: Mmj.TileId[]; }
	| { action: 'kakan'; tiles: Mmj.TileId[]; };

/**
 * 手牌から牌を選んで行う操作。選択中のみ手牌の一部がクリック可能になる。
 */
const tileSelection = ref<TileSelection | null>(null);

const selectableTiles = computed<Mmj.TileType[] | null>(() => {
	const selection = tileSelection.value;
	if (selection == null) return null;
	switch (selection.action) {
		case 'riichi':
			return Mmj.getTilesForRiichi(mj.value.myHandTileTypes);
		case 'ankan':
		case 'kakan':
			return selection.tiles.map(id => mj$type(id));
	}
});

// 手番が終わったら選択状態を持ち越さない
watch(isMyTurn, (myTurn) => {
	if (!myTurn) tileSelection.value = null;
});

const ronSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const ciiSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const ponSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const kanSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const tsumoSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const riichiSerifHouses = reactive<Record<Mmj.House, boolean>>({ e: false, s: false, w: false, n: false });
const iTsumoed = ref(false);
const showKyokuResults = ref(false);
const kyokuResults = ref<Record<Mmj.House, {
	yakus: {
		name: string;
		fan: number | null;
		isYakuman?: boolean;
	}[];
	doraCount: number;
	pointDeltas: Record<Mmj.House, number>;
} | null>>({
	e: null,
	s: null,
	w: null,
	n: null,
});
const ryuukyokued = ref(false);
const ryuukyokuResult = ref<{
	tenpaiHouses: Mmj.House[];
	notenHouses: Mmj.House[];
	pointDeltas: Record<Mmj.House, number>;
	abortive?: string;
	nagashiHouses?: Mmj.House[];
} | null>(null);
const abortiveKind = ref<string | null>(null);
const startTextShowing = ref(false);

let kyokuResultTimer: number | undefined = undefined;
let serifTimers: number[] = [];

function clearKyokuResultTimer() {
	if (kyokuResultTimer !== undefined) {
		window.clearTimeout(kyokuResultTimer);
		kyokuResultTimer = undefined;
	}
}

function clearSerifTimers() {
	for (const id of serifTimers) {
		window.clearTimeout(id);
	}
	serifTimers = [];
	for (const house of houses) {
		ronSerifHouses[house] = false;
		ciiSerifHouses[house] = false;
		ponSerifHouses[house] = false;
		kanSerifHouses[house] = false;
		tsumoSerifHouses[house] = false;
		riichiSerifHouses[house] = false;
	}
}

function scheduleKyokuResult() {
	clearKyokuResultTimer();
	kyokuResultTimer = window.setTimeout(() => {
		showKyokuResults.value = true;
		kyokuResultTimer = undefined;
	}, 1500);
}

function showSerif(target: Record<Mmj.House, boolean>, house: Mmj.House) {
	target[house] = true;
	const id = window.setTimeout(() => {
		target[house] = false;
	}, 2000);
	serifTimers.push(id);
}

type CiiPatternCode = 'x__' | '_x_' | '__x';

type CiiChoice = {
	tiles: Mmj.TileType[];
	code: CiiPatternCode;
};

/**
 * 中途流局の reason コード→日本語の対応表。
 */
const ABORTIVE_DRAW_REASONS: Record<string, string> = {
	kyushukyuhai: '九種九牌',
	suufonrenda: '四風連打',
	suuchariichi: '四家立直',
	sanchaho: '三家和',
	suukaikan: '四開槓',
};

const CII_PATTERN_CODES: CiiPatternCode[] = ['x__', '_x_', '__x'];
const ciiChoices = ref<CiiChoice[] | null>(null);

/**
 * ツモ送信後に操作ボタン欄を隠すためのフラグ。
 * 次のサーバイベント（closeCiiChoices 経由）で戻す。
 */
const tsumoPending = ref(false);

/*
if (room.value.isStarted && !room.value.isEnded) {
	useInterval(() => {
		if (room.value.isEnded) return;
		const crc32 = mj.value.calcCrc32();
		if (_DEV_) console.log('crc32', crc32);
		misskeyApi('reversi/verify', {
			roomId: room.value.id,
			crc32: crc32.toString(),
		}).then((res) => {
			if (res.desynced) {
				console.log('resynced');
				restoreRoom(res.room!);
			}
		});
	}, 10000, { immediate: false, afterMounted: true });
}
*/

const CALL_SEC = room.value.timeLimitForEachTurn;
const NEXT_KYOKU_SEC = Mmj.NEXT_KYOKU_CONFIRMATION_TIMEOUT_MS / 1000;

type TimerMode = 'turn' | 'call' | 'confirm' | 'hidden';

/**
 * 鳴き・ロンの回答を求められているかどうか
 */
const hasCall = computed(() => {
	return mj.value.canRon != null || mj.value.canPon != null || mj.value.canCii != null || mj.value.canKan != null;
});

/**
 * 鳴き・ロンの確認対象となっている捨て牌の家
 */
const callTargetHouse = computed<Mmj.House | null>(() => {
	return mj.value.canRon?.callee
		?? mj.value.canPon?.callee
		?? mj.value.canCii?.callee
		?? mj.value.canKan?.callee
		?? null;
});

function isCallTarget(house: Mmj.House, index: number, length: number): boolean {
	return callTargetHouse.value === house && index === length - 1;
}

const timerMode = ref<TimerMode>('turn');
const timerDeadline = ref<number>(0);
const myTurnTimerRmain = ref<number>(room.value.timeLimitForEachTurn);

function updateTimerRemaining() {
	myTurnTimerRmain.value = Math.max(0, Math.ceil((timerDeadline.value - Date.now()) / 1000));
}

function startTimer(seconds: number, mode: TimerMode) {
	timerMode.value = mode;
	if (mode === 'hidden') {
		timerDeadline.value = 0;
		myTurnTimerRmain.value = 0;
		return;
	}
	timerDeadline.value = Date.now() + seconds * 1000;
	myTurnTimerRmain.value = Math.max(0, Math.ceil(seconds));
}

function hideTimer() {
	startTimer(0, 'hidden');
}

function resetTurnTimer() {
	startTimer(room.value.timeLimitForEachTurn, 'turn');
}

// 初期表示が0にならないよう、初期状態から期限を設定する
if (hasCall.value) {
	startTimer(CALL_SEC, 'call');
} else {
	resetTurnTimer();
}

useInterval(() => {
	if (room.value.isEnded || timerMode.value === 'hidden') return;
	updateTimerRemaining();
}, 250, { immediate: false, afterMounted: true });

const timerVisible = computed(() => {
	if (room.value.isEnded) return false;
	switch (timerMode.value) {
		case 'turn':
			return isMyTurn.value;
		case 'call':
			return hasCall.value;
		default:
			return false;
	}
});

const timerLabel = computed(() => {
	const remaining = i18n.tsx._mahjong.remainingSeconds({ n: myTurnTimerRmain.value });
	return timerMode.value === 'call'
		? `${i18n.ts._mahjong.callConfirmation} ${remaining}`
		: remaining;
});

/*
const TIMER_INTERVAL_SEC = 3;
if (!props.room.isEnded) {
	useInterval(() => {
		if (myTurnTimerRmain.value > 0) {
			myTurnTimerRmain.value = Math.max(0, myTurnTimerRmain.value - TIMER_INTERVAL_SEC);
		}
		if (opTurnTimerRmain.value > 0) {
			opTurnTimerRmain.value = Math.max(0, opTurnTimerRmain.value - TIMER_INTERVAL_SEC);
		}

		if (iAmPlayer.value) {
			if ((isMyTurn.value && myTurnTimerRmain.value === 0) || (!isMyTurn.value && opTurnTimerRmain.value === 0)) {
			props.connection!.send('claimTimeIsUp', {});
			}
		}
	}, TIMER_INTERVAL_SEC * 1000, { immediate: false, afterMounted: true });
}
*/

function houseToUser(house: Mmj.House) {
	return mj.value.user1House === house ? room.value.user1 : mj.value.user2House === house ? room.value.user2 : mj.value.user3House === house ? room.value.user3 : room.value.user4;
}

function houseLabel(house: Mmj.House): string {
	return house === 'e' ? i18n.ts._mahjong.east : house === 's' ? i18n.ts._mahjong.south : house === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north;
}

const roundLabel = computed(() => {
	return `${houseLabel(mj.value.round)}${i18n.tsx._mahjong.kyoku({ n: mj.value.kyoku })}`;
});

function isTenpaiHouse(house: Mmj.House): boolean {
	return ryuukyokuResult.value?.tenpaiHouses.includes(house) ?? false;
}

function getPointDelta(house: Mmj.House): number {
	if (ryuukyokued.value) {
		return ryuukyokuResult.value?.pointDeltas[house] ?? 0;
	}

	let delta = 0;
	for (const res of Object.values(kyokuResults.value)) {
		if (res != null) delta += res.pointDeltas[house];
	}
	return delta;
}

function backToLobby() {
	router.push('/mahjong');
}

function chooseTile(tile: Mmj.TileId, ev: MouseEvent) {
	if (tsumoPending.value) return;
	if (!isMyTurn.value) return;

	const selection = tileSelection.value;

	if (selection == null) {
		iTsumoed.value = false;
		props.connection!.send('dahai', {
			tile: tile,
			riichi: false,
		});
		return;
	}

	if (selection.action === 'riichi') {
		iTsumoed.value = false;
		tileSelection.value = null;
		props.connection!.send('dahai', {
			tile: tile,
			riichi: true,
		});
		return;
	}

	// 選択中の操作で使える牌だけを受け付ける
	if (!selection.tiles.includes(tile)) return;

	iTsumoed.value = false;
	tileSelection.value = null;
	if (selection.action === 'ankan') {
		props.connection!.send('ankan', {
			tile: tile,
		});
	} else {
		props.connection!.send('kakan', {
			tile: tile,
		});
	}
}

function riichi() {
	if (!isMyTurn.value) return;

	const tiles = Mmj.getTilesForRiichi(mj.value.myHandTileTypes);
	if (tiles.length === 0) return;

	tileSelection.value = { action: 'riichi' };
}

function ankan() {
	if (!isMyTurn.value) return;

	const tiles = mj.value.getAnkanableTiles();
	if (tiles.length === 0) return;

	// 暗槓できる牌種が1つしかない場合は、牌を選ばせずそのまま暗槓する
	const types = new Set(tiles.map(id => mj$type(id)));
	if (types.size === 1) {
		sendAnkan(tiles[0]);
		return;
	}

	tileSelection.value = { action: 'ankan', tiles };
}

function sendAnkan(tile: Mmj.TileId) {
	tileSelection.value = null;
	iTsumoed.value = false;
	props.connection!.send('ankan', {
		tile: tile,
	});
}

function kakan() {
	if (!mj.value.canKakan()) return;

	const tiles = mj.value.getKakanableTiles();
	if (tiles.length === 0) return;

	// 加槓できる牌が1つしかない場合は、牌を選ばせずそのまま加槓する
	if (tiles.length === 1) {
		sendKakan(tiles[0]);
		return;
	}

	tileSelection.value = { action: 'kakan', tiles };
}

function sendKakan(tile: Mmj.TileId) {
	tileSelection.value = null;
	iTsumoed.value = false;
	props.connection!.send('kakan', {
		tile: tile,
	});
}

function cancelTileSelection() {
	tileSelection.value = null;
}

function tsumoHora() {
	if (!isMyTurn.value) return;

	props.connection!.send('tsumoHora', {
	});
	tileSelection.value = null;
	tsumoPending.value = true;
}

/**
 * ロン・ポン・チー・カンのいずれかを選択したら、残りの選択肢をローカルでも消す。
 * 送信後に skip を押して回答を上書きできないようにする。
 */
function clearCalls() {
	mj.value.commit_nop();
	triggerRef(mj);
}

function ron() {
	props.connection!.send('ronHora', {
	});
	closeCiiChoices();
	clearCalls();
	hideTimer();
}

function pon() {
	props.connection!.send('pon', {
	});
	closeCiiChoices();
	clearCalls();
	hideTimer();
}

function cii() {
	if (mj.value.canCii == null) return;

	const targetTile = mj.value.hoTiles[mj.value.canCii.callee].at(-1);
	if (targetTile == null) return;

	const targetType = mj$type(targetTile);
	const patterns = Mmj.getAvailableCiiPatterns(mj.value.myHandTileTypes, targetType);
	const choices = patterns.map(pattern => {
		const tiles = Mmj.sortTileTypes(pattern);
		const index = tiles.indexOf(targetType);
		return {
			tiles,
			code: CII_PATTERN_CODES[index],
		};
	});

	if (choices.length === 0) return;

	if (choices.length === 1) {
		sendCii(choices[0]);
	} else {
		ciiChoices.value = choices;
	}
}

function sendCii(choice: CiiChoice) {
	props.connection!.send('cii', {
		pattern: choice.code,
	});
	ciiChoices.value = null;
	clearCalls();
	hideTimer();
}

function closeCiiChoices() {
	ciiChoices.value = null;
	tileSelection.value = null;
	tsumoPending.value = false;
}

function kan() {
	props.connection!.send('kan', {
	});
	closeCiiChoices();
	clearCalls();
	hideTimer();
}

function skip() {
	closeCiiChoices();
	clearCalls();

	props.connection!.send('nop', {});
	hideTimer();
}

function confirmKyokuResult() {
	props.connection!.send('confirmNextKyoku', {});
	hideTimer();
}

function onStreamDahai(log: { house: Mmj.House; tile: number; riichi: boolean }) {
	console.log('onStreamDahai', log);
	closeCiiChoices();

	sound.playUrl('/client-assets/mahjong/dahai.mp3', {
		volume: 1,
		playbackRate: 1,
	});

	//if (log.house !== mj.value.state.turn) { // = desyncが発生している
	//	const _room = await misskeyApi('mahjong/show-room', {
	//		roomId: props.room.id,
	//	});
	//	restoreRoom(_room);
	//	return;
	//}

	mj.value.commit_dahai(log.house, log.tile, log.riichi);
	triggerRef(mj);

	riichiSerifHouses[log.house] = log.riichi;
	if (log.riichi) {
		const id = window.setTimeout(() => {
			riichiSerifHouses[log.house] = false;
		}, 2000);
		serifTimers.push(id);
	}

	if (hasCall.value) {
		startTimer(CALL_SEC, 'call');
	} else {
		hideTimer();
	}
}

function onStreamTsumo(log: { house: Mmj.House; tile: number }) {
	console.log('onStreamTsumo', log);
	closeCiiChoices();

	//if (log.house !== mj.value.state.turn) { // = desyncが発生している
	//	const _room = await misskeyApi('mahjong/show-room', {
	//		roomId: props.room.id,
	//	});
	//	restoreRoom(_room);
	//	return;
	//}

	mj.value.commit_tsumo(log.house, log.tile);
	triggerRef(mj);

	if (log.house === mj.value.myHouse) {
		iTsumoed.value = true;
	}

	resetTurnTimer();
}

function onStreamDahaiAndTsumo(log: { dahaiHouse: Mmj.House; dahaiTile: number; tsumoTile: number; riichi: boolean }) {
	console.log('onStreamDahaiAndTsumo', log);
	closeCiiChoices();

	//if (log.house !== mj.value.state.turn) { // = desyncが発生している
	//	const _room = await misskeyApi('mahjong/show-room', {
	//		roomId: props.room.id,
	//	});
	//	restoreRoom(_room);
	//	return;
	//}

	sound.playUrl('/client-assets/mahjong/dahai.mp3', {
		volume: 1,
		playbackRate: 1,
	});

	mj.value.commit_dahai(log.dahaiHouse, log.dahaiTile, log.riichi);
	triggerRef(mj);

	riichiSerifHouses[log.dahaiHouse] = log.riichi;
	if (log.riichi) {
		const id = window.setTimeout(() => {
			riichiSerifHouses[log.dahaiHouse] = false;
		}, 2000);
		serifTimers.push(id);
	}

	window.setTimeout(() => {
		mj.value.commit_tsumo(Mmj.nextHouse(log.dahaiHouse), log.tsumoTile);
		triggerRef(mj);

		if (Mmj.nextHouse(log.dahaiHouse) === mj.value.myHouse) {
			iTsumoed.value = true;
		}
	}, 100);

	resetTurnTimer();
}

function onStreamPonned(log: { caller: Mmj.House; callee: Mmj.House; tiles: readonly [number, number, number] }) {
	console.log('onStreamPonned', log);
	closeCiiChoices();

	//if (log.house !== mj.value.state.turn) { // = desyncが発生している
	//	const _room = await misskeyApi('mahjong/show-room', {
	//		roomId: props.room.id,
	//	});
	//	restoreRoom(_room);
	//	return;
	//}

	mj.value.commit_pon(log.caller, log.callee, log.tiles);
	triggerRef(mj);

	showSerif(ponSerifHouses, log.caller);

	resetTurnTimer();
}

function onStreamKanned(log: { caller: Mmj.House; callee: Mmj.House; tiles: readonly [number, number, number, number]; rinsyan: number; doraIndicateTiles: number[] }) {
	console.log('onStreamKanned', log);
	closeCiiChoices();

	mj.value.commit_kan(log.caller, log.callee, log.tiles, log.rinsyan, log.doraIndicateTiles);
	triggerRef(mj);

	if (log.caller === mj.value.myHouse) iTsumoed.value = true;

	showSerif(kanSerifHouses, log.caller);

	resetTurnTimer();
}

function onStreamKakanned(log: { house: Mmj.House; tiles: readonly [number, number, number, number]; rinsyan: number; from: Mmj.House; doraIndicateTiles: number[] }) {
	console.log('onStreamKakanned', log);
	closeCiiChoices();

	mj.value.commit_kakan(log.house, log.tiles, log.rinsyan, log.doraIndicateTiles);
	triggerRef(mj);

	if (log.house === mj.value.myHouse) iTsumoed.value = true;

	showSerif(kanSerifHouses, log.house);

	resetTurnTimer();
}

function onStreamKakanDeclared(log: { house: Mmj.House; tiles: readonly [number, number, number, number]; from: Mmj.House; doraIndicateTiles: number[] }) {
	console.log('onStreamKakanDeclared', log);
	closeCiiChoices();

	mj.value.commit_kakanDeclared(log.house, log.tiles, log.from, log.doraIndicateTiles);
	triggerRef(mj);

	showSerif(kanSerifHouses, log.house);

	if (hasCall.value) {
		startTimer(CALL_SEC, 'call');
	} else {
		hideTimer();
	}
}

function onStreamAnkanned(log: { house: Mmj.House; tiles: readonly [number, number, number, number]; rinsyan: number; doraIndicateTiles: number[] }) {
	console.log('onStreamAnkanned', log);
	closeCiiChoices();

	mj.value.commit_ankan(log.house, log.tiles, log.rinsyan, log.doraIndicateTiles);
	triggerRef(mj);

	if (log.house === mj.value.myHouse) iTsumoed.value = true;

	showSerif(kanSerifHouses, log.house);

	resetTurnTimer();
}

function onStreamCiied(log: { caller: Mmj.House; callee: Mmj.House; tiles: readonly [number, number, number] }) {
	console.log('onStreamCiied', log);
	closeCiiChoices();

	mj.value.commit_cii(log.caller, log.callee, log.tiles);
	triggerRef(mj);

	showSerif(ciiSerifHouses, log.caller);

	resetTurnTimer();
}

function onStreamRonned(log: { callers: Mmj.House[]; callee: Mmj.House; handTiles: Record<Mmj.House, number[]>; ronTile?: number; chankan?: boolean; uraDoraIndicateTiles?: number[] }) {
	console.log('onStreamRonned', log);
	closeCiiChoices();

	const res = mj.value.commit_ronHora(log.callers, log.callee, log.handTiles, log.ronTile != null && log.chankan != null ? { ronTile: log.ronTile, chankan: log.chankan, uraDoraIndicateTiles: log.uraDoraIndicateTiles } : { uraDoraIndicateTiles: log.uraDoraIndicateTiles });
	triggerRef(mj);

	kyokuResults.value = res;

	scheduleKyokuResult();

	for (const caller of log.callers) {
		showSerif(ronSerifHouses, caller);
	}

	console.log('ronned', res);

	startTimer(NEXT_KYOKU_SEC, 'confirm');
}

function onStreamTsumoHora(log: { house: Mmj.House; handTiles: number[]; tsumoTile: number; uraDoraIndicateTiles?: number[] }) {
	console.log('onStreamTsumoHora', log);
	closeCiiChoices();

	const res = mj.value.commit_tsumoHora(log.house, log.handTiles, log.tsumoTile, log.uraDoraIndicateTiles);
	triggerRef(mj);

	kyokuResults.value[log.house] = res;

	scheduleKyokuResult();

	showSerif(tsumoSerifHouses, log.house);

	console.log('tsumohora', res);

	startTimer(NEXT_KYOKU_SEC, 'confirm');
}

function onStreamRyuukyoku(log: { tenpaiHouses: Mmj.House[]; notenHouses: Mmj.House[]; pointDeltas: Record<Mmj.House, number>; abortive?: string; nagashiHouses?: Mmj.House[] }) {
	console.log('onStreamRyuukyoku', log);
	closeCiiChoices();

	ryuukyokuResult.value = log;
	abortiveKind.value = log.abortive ?? null;
	mj.value.commit_ryuukyoku(log.pointDeltas);
	triggerRef(mj);

	ryuukyokued.value = true;

	scheduleKyokuResult();

	startTimer(NEXT_KYOKU_SEC, 'confirm');
}

function onStreamNextKyoku(log: { room: Misskey.entities.MahjongRoomDetailed }) {
	console.log('onStreamNextKyoku', log);
	closeCiiChoices();
	clearKyokuResultTimer();
	clearSerifTimers();

	room.value = log.room;
	mj.value.commit_nextKyoku(log.room.gameState as unknown as Mmj.PlayerState);
	triggerRef(mj);

	iTsumoed.value = false;
	showKyokuResults.value = false;
	kyokuResults.value = {
		e: null,
		s: null,
		w: null,
		n: null,
	};
	ryuukyokued.value = false;
	ryuukyokuResult.value = null;
	abortiveKind.value = null;

	resetTurnTimer();
}

function onStreamEnded(log: { room: Misskey.entities.MahjongRoomDetailed }) {
	closeCiiChoices();
	clearKyokuResultTimer();
	clearSerifTimers();
	room.value = log.room;
	if (room.value.gameState != null) {
		mj.value = new Mmj.PlayerGameEngine(myUserNumber.value, room.value.gameState as unknown as Mmj.PlayerState);
		triggerRef(mj);
	}
	showKyokuResults.value = false;
	hideTimer();
}

let listening = false;

function attachListeners() {
	if (listening || props.connection == null) return;
	listening = true;
	props.connection.on('dahai', onStreamDahai);
	props.connection.on('tsumo', onStreamTsumo);
	props.connection.on('dahaiAndTsumo', onStreamDahaiAndTsumo);
	props.connection.on('ponned', onStreamPonned);
	props.connection.on('kanned', onStreamKanned);
	props.connection.on('kakanned', onStreamKakanned);
	props.connection.on('kakanDeclared', onStreamKakanDeclared);
	props.connection.on('ankanned', onStreamAnkanned);
	props.connection.on('ciied', onStreamCiied);
	props.connection.on('ronned', onStreamRonned);
	props.connection.on('tsumoHora', onStreamTsumoHora);
	props.connection.on('ryuukyoku', onStreamRyuukyoku);
	props.connection.on('nextKyoku', onStreamNextKyoku);
	props.connection.on('ended', onStreamEnded);
}

function detachListeners() {
	if (!listening || props.connection == null) return;
	listening = false;
	props.connection.off('dahai', onStreamDahai);
	props.connection.off('tsumo', onStreamTsumo);
	props.connection.off('dahaiAndTsumo', onStreamDahaiAndTsumo);
	props.connection.off('ponned', onStreamPonned);
	props.connection.off('kanned', onStreamKanned);
	props.connection.off('kakanned', onStreamKakanned);
	props.connection.off('kakanDeclared', onStreamKakanDeclared);
	props.connection.off('ankanned', onStreamAnkanned);
	props.connection.off('ciied', onStreamCiied);
	props.connection.off('ronned', onStreamRonned);
	props.connection.off('tsumoHora', onStreamTsumoHora);
	props.connection.off('ryuukyoku', onStreamRyuukyoku);
	props.connection.off('nextKyoku', onStreamNextKyoku);
	props.connection.off('ended', onStreamEnded);
}

onMounted(attachListeners);
onActivated(attachListeners);
onDeactivated(detachListeners);
onUnmounted(detachListeners);
onUnmounted(() => {
	clearKyokuResultTimer();
	clearSerifTimers();
});

</script>

<style lang="scss" module>
@keyframes shine {
	0% { translate: -30px; }
	100% { translate: -130px; }
}

.transition_serif_enterActive,
.transition_serif_leaveActive {
	transition: opacity 0.1s linear, scale 0.1s linear;
}
.transition_serif_enterFrom {
	scale: 1.25;
	opacity: 0;
}
.transition_serif_leaveTo {
	opacity: 0;
}

.root {
	background: #3C7A43;
	background-image: url('/client-assets/mahjong/bg.jpg');
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
	padding: 30px;
}

.taku {
	// 16:9 固定の舞台。横幅 = min(100%, (viewport高さ - 170px) * 16/9) で縦にはみ出さない。
	// 170px の内訳: .root の上下 padding 60px + .statusBar 約52px + 余裕。
	// max-width 960px は高さ 540px (= 960 * 9/16) に収めるための上限。旧 max-width: 600px / min-height: 600px は置き換え。
	// aspect-ratio は常時厳密に効かせる (旧 min-height: 520px は比率を崩し、狭幅で手牌の折り返し・はみ出しを招いていたため廃止)。
	// 代わりに container-type で舞台幅を基準化し、内部の主要寸法 (手牌・相手手牌・中央パネル・名札) を
	// cqw (= 舞台幅の 1%) と px 上限の min() で表すことで、舞台が縮んでも設計比率のまま全体が縮小する。
	position: relative;
	container-type: inline-size;
	width: 100%;
	width: min(100%, calc((100vh - 170px) * 16 / 9));
	width: min(100%, calc((100dvh - 170px) * 16 / 9));
	max-width: 960px;
	aspect-ratio: 16 / 9;
	margin: auto;
	box-sizing: border-box;
}

.kyokuResult {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	box-sizing: border-box;
	background: color-mix(in srgb, var(--MI_THEME-bg) 60%, transparent);
}

.kyokuResultCard {
	width: min(480px, 100%);
	max-height: 88vh;
	overflow: auto;
	box-sizing: border-box;
	padding: 24px;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border-radius: var(--MI-radius);
	box-shadow: 0 8px 32px #000a;
}

.kyokuResultTitle {
	margin-bottom: 16px;
	font-size: 1.4em;
	font-weight: bold;
	text-align: center;
}

.kyokuResultRow {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 12px 0;
	border-top: solid 1px var(--MI_THEME-divider);

	&:first-child {
		border-top: none;
	}
}

.kyokuResultHouseRow {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: bold;
}

.kyokuResultHouse {
	min-width: 2em;
}

.kyokuResultAvatar {
	width: 24px;
	height: 24px;
}

.kyokuResultName {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.kyokuResultYaku {
	font-size: 90%;
	opacity: 0.9;
}

.kyokuResultAnimatedPoints {
	margin-left: auto;
	flex-shrink: 0;
}

.kyokuResultSummary {
	margin-top: 12px;
	padding-top: 8px;
	border-top: solid 2px var(--MI_THEME-divider);
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.kyokuResultRowCompact {
	gap: 0;
}

.kyokuResultEndPoints {
	margin-left: auto;
	font-weight: bold;
	white-space: nowrap;
}

.kyokuResultJudgement {
	flex-shrink: 0;
	padding: 1px 6px;
	border-radius: 4px;
	font-size: 80%;
	white-space: nowrap;
}

.kyokuResultTenpai {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.kyokuResultNoten {
	background: color-mix(in srgb, var(--MI_THEME-fg) 10%, transparent);
	opacity: 0.75;
}

.kyokuResultFooter {
	display: flex;
	justify-content: center;
	margin-top: 16px;
}

.kyokuResultTimer {
	margin: 16px 0;
	font-size: 1.1em;
}

.centerPanel {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	display: grid;
	place-items: center;
	// 大きさは捨て牌1行分に合わせた真四角: 一辺 = 河6牌の牌本体スパン
	// (6 × 本体ピッチ28.8 = 172.8。河の牌寸法 ×0.8 での視覚寸法、設計px)。
	// ルート幅スパン (201.6) では対面の河4段が手札に収まらないため、
	// 牌本体のスパンで採る。
	width: min(172.8px, 18cqw);
	height: min(172.8px, 18cqw);
	margin: auto;
	background: #333;
	border: solid 1px #888;
	border-radius: 10px;
	box-shadow: 0 4px 10px #000a;
}
.centerPanelTickerToi {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	rotate: 180deg;
}
.centerPanelTickerKami {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	rotate: 90deg;
}
.centerPanelTickerSimo {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	rotate: -90deg;
}
.centerPanelTickerMe {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
}
.centerPanelHouse {
	font-weight: bold;
}
.centerPanelPoint {
	margin-left: 10px;
}

.centerPanelContent {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	max-width: min(140px, 14.6cqw);
	max-height: 100%;
	overflow: hidden;
	// 150px パネル内に収める。待ち牌の折返しは .waitTilesList の flex-wrap で対応。
}

.waitTiles {
	display: flex;
	flex-direction: column;
	align-items: center;
	max-width: 150px;
}

.waitTilesLabel {
	color: #fff;
	font-size: 60%;
	opacity: 0.8;
	text-shadow: 0 1px 2px #000;
	white-space: nowrap;
	flex-shrink: 0;
}

.waitTilesList {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	max-width: 140px;
	// 1行3枚(1枚の実効幅約36px)で折り返し、2行分(約96px)まで表示し、超過分はスクロールで全待ちを確認できる。
	max-height: 96px;
	overflow-y: auto;
}

.statusBar {
	// 幅は .taku と同じ規則でテーブル端に揃える（170px 等の詳細は .taku 側のコメント参照）。
	position: relative;
	z-index: 10;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	width: 100%;
	width: min(100%, calc((100vh - 170px) * 16 / 9));
	width: min(100%, calc((100dvh - 170px) * 16 / 9));
	max-width: 960px;
	min-height: 44px;
	margin: 0 auto 8px;
	box-sizing: border-box;
}

.statusBarLeft {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.roundInfo {
	padding: 4px 12px;
	background: color-mix(in srgb, black 55%, transparent);
	color: #fff;
	border-radius: 999px;
	font-size: 80%;
	font-weight: bold;
	white-space: nowrap;
	pointer-events: none;
}

.turnTimer {
	width: min-content;
	padding: 4px 12px;
	background: color-mix(in srgb, black 55%, transparent);
	color: #fff;
	border-radius: 999px;
	font-size: 80%;
	white-space: nowrap;
	pointer-events: none;
}

.doraIndicators {
	display: flex;
	align-items: center;
	gap: 4px;
	margin-left: auto;
	pointer-events: none;
}

.doraIndicatorLabel {
	color: #fff;
	font-size: 80%;
	margin-right: 4px;
	text-shadow: 0 1px 2px #000;
	white-space: nowrap;
	flex-shrink: 0;
}
.doraBack {
	// 未公開のドラ表示牌 (裏向き)。隣の XTile 本体 (72px箱の 128/256 = 36px幅) と寸法を揃える。
	// ここは .taku の外なので cqw は viewport 基準 (XTile 側と同基準)。
	// 裏面画像は 180度回して置く (王牌の伏せ牌の向き)。
	width: min(36px, 3.75cqw);
	rotate: 180deg;
	user-select: none;
	pointer-events: none;
}
.centerPanelIndicatorContainerToi {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
	rotate: 180deg;
}
.centerPanelIndicatorContainerKami {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
	rotate: 90deg;
}
.centerPanelIndicatorContainerSimo {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
	rotate: -90deg;
}
.centerPanelIndicatorContainerMe {
	position: absolute;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
}
.centerPanelIndicator {
	position: absolute;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	margin: auto;
	width: min(100px, 10.4cqw);
	height: 10px;
	border-radius: 999px;
}
.centerPanelIndicatorIndicated {
	background: #ff0;
}

.toimenMeldLine {
	// 対面の副露は手札とは別要素に分離した (ユーザー指示: 同じ帯の中で
	// 手札の増減に連れて副露が一瞬ずれるのを避ける)。手札の行と同じ高さで、
	// 対面から見た右手側 = 舞台左端 (上家の名札の内側 178px) に固定し、
	// 副露は左から順に並ぶ。手札 (裏向き) の枚数が変わっても動かない。
	// 副露4組でも最大約440px で、手札の最小左端 (1枚時 約656px) に届かない。
	position: absolute;
	top: min(6px, 0.63cqw);
	left: min(178px, 18.54cqw);
	right: min(272px, 28.33cqw);
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	gap: 4px;
}

.toimenHuroItem {
	// 対面の副露牌は対面の向き (180度回転) にする。回転はアイテム単位で、
	// 副露内の横向き位置 (huro.vue が対面視点で決める) もろとも反転する
	// ため、対面から見た配置が正しくなる。河 (180deg) とも向きが揃う。
	// 自家の .myHuroItem と対称: 副露牌の本体上辺は XTile の負マージンの
	// 都合でアイテムの上辺より約9.5px 下にあるため、その分だけ上げる。
	rotate: 180deg;
	margin-top: max(-9.5px, -0.99cqw);
	flex-shrink: 0;
}

.handTilesOfToimen {
	// 対面の手札 (裏向き) は単独の要素。対面の左手側 = 舞台右側に固定する
	// 左寄せアンカー: 右端 272px は13枚時の中央寄せ位置で、枚数が減ると
	// 左端が右へ後退する。副露 (.toimenMeldLine) とは分離している。
	position: absolute;
	top: min(6px, 0.63cqw);
	right: min(272px, 28.33cqw);
	white-space: nowrap;
}
.handTileImgOfToimen {
	display: inline-block;
	vertical-align: bottom;
	// 13枚 = 舞台幅の約43%。設計幅 (960px) では従来どおり 32px。
	width: min(32px, 3.33cqw);
}

.kamityaHandLine {
	// 上家の手札列だけの帯 (副露は .kamityaMeldLine に分離した)。
	// 列の中心は舞台中央から 25cqw (x=240px) で、帯はその中心の幅126px。
	// 縦方向は左寄せ: 上家の左手側 = 上端を13枚時の位置 (上端から114px) に
	// 固定し、枚数が減ると下端が上へ後退する。
	position: absolute;
	top: min(114px, 11.88cqw);
	left: min(177px, 18.44cqw);
	width: min(126px, 13.13cqw);
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}

.simotyaHandLine {
	// 下家側も手札列だけの帯。左と対称で、下家の左手側 = 下端を13枚時の
	// 位置 (下端から114px) に固定する。
	position: absolute;
	bottom: min(114px, 11.88cqw);
	right: min(177px, 18.44cqw);
	width: min(126px, 13.13cqw);
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
}

.handTilesOfKamitya {
	// 配置は .kamityaHandLine 側。13枚の縦積みは設計幅で約336px
	// (1枚約48px・重なり-24px)。舞台が縮むと cqw で連動縮小する。
	flex-shrink: 0;
}

.handTilesOfSimotya {
	// 配置は .simotyaHandLine 側。左と対称。
	flex-shrink: 0;
}

.kamityaMeldLine {
	// 上家の副露レーンの置き場。手札とは別要素に分離し、手札列と反対側の
	// 下端に固定する (手札の増減で動かない)。レーン自体は回転して視覚寸法が
	// 入れ替わるため、視覚寸法どおりの箱 (幅126px × 高さ370px) を確保し、
	// レーンはその中心に重ねる。副露がない時も箱は確保されるが透明で、
	// 河や操作要素の邪魔にはならない (それらは DOM 後方で上に描かれる)。
	position: absolute;
	bottom: min(8px, 0.83cqw);
	left: min(177px, 18.44cqw);
	width: min(126px, 13.13cqw);
	height: min(370px, 38.54cqw);
}

.simotyaMeldLine {
	// 下家側は上端に固定する (左と対称)。
	position: absolute;
	top: min(8px, 0.83cqw);
	right: min(177px, 18.44cqw);
	width: min(126px, 13.13cqw);
	height: min(370px, 38.54cqw);
}

.sideHuroItem {
	flex-shrink: 0;
}

.myMeldLine {
	// 自家の副露は手札とは別要素に分離した (ユーザー指示: 同じ帯の中では
	// 打牌・ツモのたびに手札の幅が変わり、副露が一瞬左右にずれていた)。
	// 手札の行と同じ下辺で、右端 (下家の名札の内側 178px) に固定し、
	// 副露は右から順に並ぶ。行に入りきらない分は wrap-reverse で上の行へ
	// 折り返す (折り返し可はユーザー了承済み)。手札が減るほど副露側へ
	// 広がり、手札 (左固定) と副露 (右固定) は中央で出会う。
	// align-items: flex-end で副露の下辺を手札と揃える。
	position: absolute;
	bottom: min(5px, 0.52cqw);
	left: min(252px, 26.29cqw);
	right: min(178px, 18.54cqw);
	display: flex;
	flex-wrap: wrap-reverse;
	justify-content: flex-end;
	align-items: flex-end;
	gap: 4px;
}

.myHuroItem {
	// 副露牌の本体下辺は XTile の負マージンの都合でアイテムの下辺より
	// 約9.5px 上にある (実測)。手札の牌下辺と揃えるため、その分だけ下げる。
	margin-bottom: max(-9.5px, -0.99cqw);
	flex-shrink: 0;
}

.handTilesOfMe {
	// 自家の手札は単独の要素 (副露は .myMeldLine に分離)。
	// 左端 252px = 13枚時の中央寄せ位置に固定する左寄せ: 鳴いて牌が減っても
	// 左端は動かず、手札は右側から縮む (ツモ時は右へ伸びる)。
	// nowrap で手札自体の折り返しを禁止する。
	position: absolute;
	bottom: min(5px, 0.52cqw);
	left: min(252px, 26.29cqw);
	text-align: left;
	white-space: nowrap;
}

.huroTilesOfKamitya {
	// 左側の副露レーン。.kamityaMeldLine の中心に重ね、レーンごと河と同じ
	// 90deg 回転させて副露牌が上家の向きになるようにする。回転後の視覚寸法は
	// 幅126px × 高さ370px で、手札列と同じ列 (中心 x=240px) に収まる。
	// ローカル座標では flex 行の主軸 (+x) が舞台の下方向に対応する:
	// justify-content: flex-end で副露はレーン下端 = 舞台の下端側から
	// 順に積まれ、入りきらない分は wrap-reverse で中央側の列へ折り返す。
	// align-items / align-content: center で牌の列を帯の中心に揃える。
	position: absolute;
	left: 50%;
	top: 50%;
	translate: -50% -50%;
	rotate: 90deg;
	width: min(370px, 38.54cqw);
	height: min(126px, 13.13cqw);
	display: flex;
	flex-direction: row;
	flex-wrap: wrap-reverse;
	justify-content: flex-end;
	align-items: center;
	align-content: center;
	gap: 4px;
}

.huroTilesOfSimotya {
	// 右側の副露レーン。左と対称で -90deg 回転 (下家の向き)。
	// ローカル +x は舞台の上方向に対応し、justify-content: flex-end で
	// 副露はレーン上端 = 舞台の上端側から順に積まれる。折り返しは
	// wrap で中央側の列へ出る。
	position: absolute;
	left: 50%;
	top: 50%;
	translate: -50% -50%;
	rotate: -90deg;
	width: min(370px, 38.54cqw);
	height: min(126px, 13.13cqw);
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	justify-content: flex-end;
	align-items: center;
	align-content: center;
	gap: 4px;
}

.hoTilesContainer {
	// 河全体の 0.8 倍は、transform の scale ではなく牌寸法の倍率
	// (--mj-tile-ratio) で行う。scale を使うとレイヤーが低解像度で
	// ラスター化され、河の牌がぼやけて描かれる (実測: 鮮明さの指標で
	// 約1/2)。倍率方式では牌の画像が直接縮小描画され、ぼやけない。
	// 子要素の配置オフセットは視覚値そのもの (旧 scale 前提の設計値ではない)。
	// パネル端 (半分約87.8) と牌本体の間隔は四家とも約7.9px に統一する:
	// 本体のアセット内位置が家ごとに違う (putted-tile の本体マージン
	// 自家48・対面16・左右40 [/256]) ため、オフセットは家ごとに調整する。
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	--mj-tile-ratio: 0.8;
}

.hoTilesContainerOfToimen {
	// 開始端(視覚右端)を中央-86.4pxに固定 (自家と対称)。
	// 縦オフセットは 103.2px (他家より 7.2px 外側): 対面の牌はアセット内で
	// 本体がパネル側の端に寄っている (putted-tile-2 の本体マージン
	// 16/256、自家は 48/256) ため、ルート端の距離を他家と揃えると本体だけ
	// パネルに約7px 近づいて見える。本体とパネル端の間隔を四家とも
	// 約7.9px に揃えるため、この分だけ外側に置く。
	// 3段目までは手札 (裏向き、下端54px) と間隔が空く。4段目 (19枚以上)
	// では牌本体が手札下端に届くが、パネル一辺172.8 + 河4段 + 手札で
	// 舞台の縦270px (半分) をほぼ使い切るため、この大きさでは不可避。
	position: absolute;
	bottom: calc(50% + min(103.2px, 10.75cqw));
	left: auto;
	right: calc(50% - min(86.4px, 9cqw));
	margin: 0;
	width: min-content;
}
.hoTilesOfToimen {
	rotate: 180deg;
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
}

.hoTilesContainerOfKamitya {
	// 縦アンカーは河グリッド (163.2px) の中心を舞台中央に合わせる
	// (50% - 81.6px)。以前は河全体が上にずれていた。
	// 横オフセットは 97.8px: 本体とパネル左端 (半分約87.8) の間隔を
	// 四家統一の約7.9px にする (左右の牌の本体マージンは 40/256)。
	// 河外端 = 97.8 + 163.2 = 中央-261px。
	// オフセット・グリッド幅は設計値を上限に cqw 連動する。
	position: absolute;
	right: calc(50% + min(97.8px, 10.19cqw));
	top: calc(50% - min(81.6px, 8.5cqw));
	bottom: auto;
	margin: auto;
	height: min-content;
}
.hoTilesOfKamitya {
	rotate: 90deg;
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
	grid-template-rows: 1fr 1fr 1fr 1fr 1fr 1fr;
	aspect-ratio: 1;
	// 6 cols * 27.2px (27.2px = (72px + 2 * -19px) * 0.8: .h horizontal margin in tile.vue)
	width: min(163.2px, 17cqw);
}

.hoTilesContainerOfSimotya {
	// 上家側と対称。横オフセット 97.8px、河外端は中央+261px。
	position: absolute;
	left: calc(50% + min(97.8px, 10.19cqw));
	top: calc(50% - min(81.6px, 8.5cqw));
	bottom: auto;
	margin: auto;
	height: min-content;
}
.hoTilesOfSimotya {
	rotate: -90deg;
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
	grid-template-rows: 1fr 1fr 1fr 1fr 1fr 1fr;
	aspect-ratio: 1;
	// 6 cols * 27.2px (27.2px = (72px + 2 * -19px) * 0.8: .h horizontal margin in tile.vue)
	width: min(163.2px, 17cqw);
	// 開始隅は回転の向きで決まる: rotate -90deg では先頭牌が「中央寄り・下」の隅に来る。
	// これは上家 (先頭牌が中央寄り・上) と回転対称で、各家の河が前家の側から流れ始める配置。
	// 以前あった direction: rtl は開始隅を上にして回転対称を崩すため付けない。
}

.hoTilesContainerOfMe {
	// 開始端(左端)を中央-86.4pxに固定。86.4px = 3セル×28.8px
	// (28.8px = (72px + 2 * -18px) * 0.8: .v horizontal margin in tile.vue)。
	// 縦オフセット96px: パネル下端 (半分約87.8) から牌本体で約7.9px。
	position: absolute;
	top: calc(50% + min(96px, 10cqw));
	left: calc(50% - min(86.4px, 9cqw));
	right: auto;
	margin: 0;
	width: min-content;
}
.hoTilesOfMe {
	display: grid;
	grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
}

.playersContainer {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 100;
	pointer-events: none;
}
.player {
	position: absolute;
	display: flex;
	align-items: center;
	gap: 8px;
	margin: auto;
	width: auto;
	// 名札は舞台幅の 17.7% まで。自家手牌 (最大約51%) と合わせても 17.7 + 51 + 17.7 = 約86% に収まり、
	// どの舞台幅でも隅の名札が中央寄せの手牌に重ならない。
	max-width: min(170px, 17.7cqw);
	height: min-content;
	padding: 6px 10px;
	box-sizing: border-box;
	background: color-mix(in srgb, black 55%, transparent);
	color: #fff;
	border-radius: 5px;
	font-size: 80%;
	z-index: 110;
}
.playerName {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.playerHouse {
	flex-shrink: 0;
	opacity: 0.75;
	font-size: 80%;
	font-weight: bold;
}
.riichi {
	color: var(--MI_THEME-warn);
	font-size: 80%;
	font-weight: bold;
}
.playerOfToimen {
	// 右上隅。頂部中央の対面手牌・左上の対面副露と重ならない。
	top: 8px;
	right: 8px;
}
.playerOfKamitya {
	// 左上隅。下の対面副露(top 52px〜)と縦に並び重ならない。
	top: 8px;
	left: 8px;
	margin: 0;
}
.playerOfSimotya {
	// 右下隅。上の自家副露(bottom 76px〜)と縦に並び重ならない。
	bottom: 8px;
	right: 8px;
	margin: 0;
}
.playerOfMe {
	// 左下隅。底部中央の自家手牌(中央寄せ)・右下の自家副露と重ならない。
	bottom: 8px;
	left: 8px;
	margin: 0;
}

.serifContainer {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 90;
	pointer-events: none;
}
.serifContainerOfKamitya {
	position: absolute;
	top: 0;
	bottom: 0;
	left: min(56px, 5.83cqw);
	margin: auto;
	width: min(150px, 15.6cqw);
	height: min-content;
	filter: drop-shadow(0 2px 4px #000c);
}
.serifContainerOfSimotya {
	position: absolute;
	top: 0;
	bottom: 0;
	right: min(56px, 5.83cqw);
	margin: auto;
	width: min(150px, 15.6cqw);
	height: min-content;
	filter: drop-shadow(0 2px 4px #000c);
}
.serifContainerOfToimen {
	position: absolute;
	top: min(36px, 3.75cqw);
	left: 0;
	right: 0;
	margin: auto;
	width: min(150px, 15.6cqw);
	height: min-content;
	filter: drop-shadow(0 2px 4px #000c);
}
.serifContainerOfMe {
	position: absolute;
	bottom: min(70px, 7.29cqw);
	left: 0;
	right: 0;
	margin: auto;
	width: min(150px, 15.6cqw);
	height: min-content;
	filter: drop-shadow(0 2px 4px #000c);
}

.ryuukyokuContainer {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	width: min(200px, 20.8cqw);
	height: min-content;
	margin: auto;
	z-index: 100;
	pointer-events: none;
}

.sideTile {
	// 牌側面 (tile-side.png, 32x48 設計) の縦積み。重なりは設計幅で -24px (1枚の見える高さ24px)。
	// 舞台縮小時は cqw で重なりも連動して小さくし、13枚が縦に収まる比率を保つ。
	margin-bottom: max(-24px, -2.5cqw);
}

.sideTileImg {
	display: block;
	// 対面手牌と同じ幅規則 (設計 32px = 舞台幅の 3.33%)。
	width: min(32px, 3.33cqw);
}

.sideTileImgFlip {
	scale: -1 1;
}

.hoTile {
	position: relative;
	display: inline-block;
	margin-bottom: max(-8px, -0.83cqw);
}

.callTarget {
	z-index: 100 !important;
	outline: 2px solid #ffd54f;
	outline-offset: 2px;
	border-radius: 4px;
	animation: callTargetBlink 900ms ease-in-out infinite;
}

@keyframes callTargetBlink {
	0%, 100% {
		filter: brightness(1);
		scale: 1;
		box-shadow: 0 0 0 0 transparent;
	}

	50% {
		filter: brightness(1.6);
		scale: 1.08;
		box-shadow: 0 0 12px 3px #ffd54f;
	}
}

@media (prefers-reduced-motion: reduce) {
	.callTarget {
		animation: none;
		filter: brightness(1.15);
		scale: 1;
		box-shadow: 0 0 8px 2px #ffd54f;
	}
}

.actions {
	position: absolute;
	bottom: min(76px, 7.92cqw);
	left: 0;
	right: 0;
	z-index: 200;
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
}

.ciiChoicePanel {
	position: fixed;
	left: 50%;
	bottom: calc(150px + env(safe-area-inset-bottom, 0px));
	z-index: 300;
	width: min(92vw, 440px);
	box-sizing: border-box;
	padding: 12px 16px;
	transform: translateX(-50%);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	border-radius: var(--MI-radius);
	box-shadow: 0 8px 32px #000a;
}

.ciiChoiceTitle {
	margin-bottom: 8px;
	font-size: 90%;
	font-weight: bold;
	text-align: center;
}

.ciiChoiceList {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
}

.ciiChoiceButton {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 48px;
	padding: 4px 20px;
	background: var(--MI_THEME-buttonBg);
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}
}

.ciiChoiceTiles {
	display: flex;
	align-items: center;
}

.ciiChoiceFooter {
	display: flex;
	justify-content: center;
	margin-top: 8px;
}

@media (max-width: 520px) {
	.root {
		padding: 8px;
		min-height: 100vh;
		min-height: 100dvh;
		box-sizing: border-box;
		overflow-x: hidden;
	}

	.taku {
		// .root padding 16px + .statusBar 約52px = 約68px → 70px差し引きに切替。フォールバック付き。
		width: 100%;
		width: min(100%, calc((100vh - 70px) * 16 / 9));
		width: min(100%, calc((100dvh - 70px) * 16 / 9));
	}

	.ciiChoicePanel {
		bottom: calc(168px + env(safe-area-inset-bottom, 0px));
		padding: 12px;
	}

	.ciiChoiceButton {
		padding: 4px 18px;
	}

	// 手牌・名札・中央パネルの縮小は cqw 連動 (各基本定義側) に一本化したため、
	// ここでは待機表示の上限だけを狭幅向けに絞る。
	.waitTiles {
		max-width: 110px;
	}

	.waitTilesList {
		max-width: 104px;
		max-height: 84px;
	}

	// 河オフセット・副露レーンの狭幅調整は cqw 連動 (各基本定義側) に一本化した。
}
</style>
